//! Background sync of the enrichment data. Runs at startup, when the key or account changes, and
//! after a game session (the watcher sees `localconfig.vdf` change).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, PoisonError, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::{Achievements, Enrichment};
use crate::error::Error;
use crate::library::service::{LibraryService, LibraryUpdated};
use crate::model::AppId;
use crate::settings;
use crate::web::{HttpClient, steam_api};

/// Owned games change rarely; refresh them at most this often (unless forced).
const OWNED_MAX_AGE: Duration = Duration::from_secs(3600);
/// Spacing between achievement requests (the Web API allows 100,000 calls a day).
const ACHIEVEMENT_SPACING: Duration = Duration::from_millis(150);
/// Save and notify the UI every this many achievement updates.
const ACHIEVEMENT_BATCH: usize = 10;

pub struct EnrichmentService {
    cache_dir: PathBuf,
    data: RwLock<Arc<Enrichment>>,
    syncing: AtomicBool,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

impl EnrichmentService {
    pub fn new(cache_dir: PathBuf) -> Self {
        let data = Enrichment::load(&cache_dir);
        Self {
            cache_dir,
            data: RwLock::new(Arc::new(data)),
            syncing: AtomicBool::new(false),
        }
    }

    pub fn current(&self) -> Arc<Enrichment> {
        self.data
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn store(&self, enrichment: Enrichment) {
        // A failed cache write only costs a refetch next launch.
        let _ = enrichment.save(&self.cache_dir);
        *self.data.write().unwrap_or_else(PoisonError::into_inner) = Arc::new(enrichment);
    }

    /// Forgets everything (key removed or account switched).
    pub fn reset(&self, account: Option<u64>) {
        self.store(Enrichment::reset(account));
    }

    /// Fetches the owned games with `key`; on success stores them. Used to validate a new key.
    pub async fn sync_owned(
        &self,
        client: &reqwest::Client,
        key: &str,
        account: u64,
    ) -> Result<(), Error> {
        match steam_api::owned_games(client, key, account).await {
            Ok(owned) => {
                let current = self.current();
                let mut next = if current.account == Some(account) {
                    (*current).clone()
                } else {
                    Enrichment::reset(Some(account))
                };
                next.owned = owned;
                next.owned_synced_at = Some(now_unix());
                next.last_error = None;
                self.store(next);
                Ok(())
            }
            Err(error) => {
                self.record_error(&error);
                Err(error)
            }
        }
    }

    fn record_error(&self, error: &Error) {
        let mut next = (*self.current()).clone();
        next.last_error = Some(error.to_string());
        self.store(next);
    }

    fn set_achievements(&self, app_id: AppId, value: Achievements) {
        let mut next = (*self.current()).clone();
        next.achievements.insert(app_id, value);
        *self.data.write().unwrap_or_else(PoisonError::into_inner) = Arc::new(next);
    }

    fn save(&self) {
        let _ = self.current().save(&self.cache_dir);
    }

    /// Full background sync, if a key is set. One at a time; extra calls while one runs are
    /// dropped (the running one already picks up the latest state at each step).
    pub fn spawn_sync(app: AppHandle, force_owned: bool) {
        tauri::async_runtime::spawn(async move {
            let service = app.state::<EnrichmentService>();
            if service.syncing.swap(true, Ordering::AcqRel) {
                return;
            }
            let _ = service.sync(&app, force_owned).await;
            service.syncing.store(false, Ordering::Release);
        });
    }

    async fn sync(&self, app: &AppHandle, force_owned: bool) -> Result<(), Error> {
        let Some(key) = settings::api_key() else {
            return Ok(());
        };
        let Some(account) = app.state::<LibraryService>().active_account() else {
            return Ok(());
        };
        let client = app.state::<HttpClient>().0.clone();
        let notify = || {
            let _ = LibraryUpdated.emit(app);
        };

        let current = self.current();
        let owned_fresh = current.account == Some(account)
            && current
                .owned_synced_at
                .is_some_and(|at| now_unix().saturating_sub(at) < OWNED_MAX_AGE.as_secs());
        if force_owned || !owned_fresh {
            self.sync_owned(&client, &key, account).await?;
            notify();
        }

        let stale = self.current().stale_achievements();
        for (index, app_id) in stale.iter().enumerate() {
            let last_played = self
                .current()
                .owned
                .iter()
                .find(|game| game.app_id == *app_id)
                .and_then(|game| game.last_played);
            match steam_api::achievements(&client, &key, account, *app_id).await {
                Ok(result) => {
                    let (unlocked, total) = result.unwrap_or((0, 0));
                    self.set_achievements(
                        *app_id,
                        Achievements {
                            fetched_for: last_played,
                            unlocked,
                            total,
                        },
                    );
                }
                Err(error) => {
                    self.save();
                    self.record_error(&error);
                    notify();
                    return Err(error);
                }
            }
            if (index + 1) % ACHIEVEMENT_BATCH == 0 {
                self.save();
                notify();
            }
            tokio::time::sleep(ACHIEVEMENT_SPACING).await;
        }
        if !stale.is_empty() {
            self.save();
            notify();
        }
        Ok(())
    }
}
