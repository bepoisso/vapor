//! Background sync of the enrichment data. Runs at startup, when the key, account or Store
//! opt-in changes, and after a game session (the watcher sees `localconfig.vdf` change).

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, PoisonError, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::{Achievements, Enrichment, StoreEntry};
use crate::error::Error;
use crate::library::service::{LibraryService, LibraryUpdated};
use crate::model::AppId;
use crate::settings::{self, SettingsStore};
use crate::web::store_api::{self, StoreAnswer};
use crate::web::{HttpClient, steam_api};

/// Owned games change rarely; refresh them at most this often (unless forced).
const OWNED_MAX_AGE: Duration = Duration::from_secs(3600);
/// Spacing between achievement requests (the Web API allows 100,000 calls a day).
const ACHIEVEMENT_SPACING: Duration = Duration::from_millis(150);
/// Spacing between Store requests: the unofficial endpoint allows ~200 per 5 minutes.
const STORE_SPACING: Duration = Duration::from_millis(1500);
/// Save and notify the UI every this many updates.
const BATCH: usize = 10;

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

    /// Replaces the data in memory only (see `save`).
    fn set(&self, enrichment: Enrichment) {
        *self.data.write().unwrap_or_else(PoisonError::into_inner) = Arc::new(enrichment);
    }

    /// Writes the current data to disk. A failed write only costs a refetch next launch.
    fn save(&self) {
        let _ = self.current().save(&self.cache_dir);
    }

    fn update(&self, change: impl FnOnce(&mut Enrichment)) {
        let mut next = (*self.current()).clone();
        change(&mut next);
        self.set(next);
    }

    /// Forgets the account data (key removed or account switched); keeps Store details.
    pub fn reset(&self, account: Option<u64>) {
        let store = self.current().store.clone();
        self.set(Enrichment::reset(account, store));
        self.save();
    }

    /// Forgets the Store details (the user turned the Store opt-in off).
    pub fn clear_store(&self) {
        self.update(|enrichment| enrichment.store.clear());
        self.save();
    }

    fn record_error(&self, error: &Error) {
        self.update(|enrichment| enrichment.last_error = Some(error.to_string()));
        self.save();
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
                    Enrichment::reset(Some(account), current.store.clone())
                };
                next.owned = owned;
                next.owned_synced_at = Some(now_unix());
                next.last_error = None;
                self.set(next);
                self.save();
                Ok(())
            }
            Err(error) => {
                self.record_error(&error);
                Err(error)
            }
        }
    }

    /// Full background sync. One at a time; calls while one runs are dropped (the running one
    /// reads the latest state at each step).
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
        let client = app.state::<HttpClient>().0.clone();
        let notify = || {
            let _ = LibraryUpdated.emit(app);
        };
        let library = app.state::<LibraryService>();

        let web_api = match (settings::api_key(), library.active_account()) {
            (Some(key), Some(account)) => {
                self.sync_web_api(&client, &key, account, force_owned, &notify)
                    .await
            }
            _ => Ok(()),
        };

        let store = if app.state::<Arc<SettingsStore>>().get().store_enrichment {
            let mut app_ids: BTreeSet<AppId> = library.installed_app_ids().into_iter().collect();
            app_ids.extend(self.current().owned.iter().map(|game| game.app_id));
            self.sync_store(&client, &app_ids.into_iter().collect::<Vec<_>>(), &notify)
                .await
        } else {
            Ok(())
        };
        web_api.and(store)
    }

    async fn sync_web_api(
        &self,
        client: &reqwest::Client,
        key: &str,
        account: u64,
        force_owned: bool,
        notify: &impl Fn(),
    ) -> Result<(), Error> {
        let current = self.current();
        let owned_fresh = current.account == Some(account)
            && current
                .owned_synced_at
                .is_some_and(|at| now_unix().saturating_sub(at) < OWNED_MAX_AGE.as_secs());
        if force_owned || !owned_fresh {
            self.sync_owned(client, key, account).await?;
            notify();
        }

        let stale = self.current().stale_achievements();
        for (index, app_id) in stale.iter().copied().enumerate() {
            let last_played = self
                .current()
                .owned
                .iter()
                .find(|game| game.app_id == app_id)
                .and_then(|game| game.last_played);
            match steam_api::achievements(client, key, account, app_id).await {
                Ok(result) => {
                    let (unlocked, total) = result.unwrap_or((0, 0));
                    self.update(|enrichment| {
                        enrichment.achievements.insert(
                            app_id,
                            Achievements {
                                fetched_for: last_played,
                                unlocked,
                                total,
                            },
                        );
                    });
                }
                Err(error) => {
                    self.record_error(&error);
                    notify();
                    return Err(error);
                }
            }
            if (index + 1) % BATCH == 0 {
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

    async fn sync_store(
        &self,
        client: &reqwest::Client,
        app_ids: &[AppId],
        notify: &impl Fn(),
    ) -> Result<(), Error> {
        let stale = self.current().stale_store(app_ids, now_unix());
        for (index, app_id) in stale.iter().copied().enumerate() {
            let details = match store_api::app_details(client, app_id).await {
                Ok(StoreAnswer::Details(details)) => Some(details),
                Ok(StoreAnswer::Unknown) => None,
                // Stop for now; the next sync (startup, settings change) carries on.
                Ok(StoreAnswer::RateLimited) => break,
                Err(error) => {
                    self.save();
                    self.record_error(&error);
                    notify();
                    return Err(error);
                }
            };
            self.update(|enrichment| {
                enrichment.store.insert(
                    app_id,
                    StoreEntry {
                        fetched_at: now_unix(),
                        details,
                    },
                );
            });
            if (index + 1) % BATCH == 0 {
                self.save();
                notify();
            }
            tokio::time::sleep(STORE_SPACING).await;
        }
        if !stale.is_empty() {
            self.save();
            notify();
        }
        Ok(())
    }
}
