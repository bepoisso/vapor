//! The library the UI shows. Startup serves Vapor's cached snapshot (no Steam file is read on the
//! critical path), a background scan refreshes it, and a file watcher keeps it current while
//! Vapor runs. The UI is told through the `LibraryUpdated` event.

use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError, RwLock};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use super::sample::{self, SampleLibrary};
use super::snapshot::{self, SNAPSHOT_VERSION, Snapshot};
use crate::enrichment::Enrichment;
use crate::enrichment::service::EnrichmentService;
use crate::error::Error;
use crate::images::{ImageKind, ImageRequest};
use crate::model::{AppId, Game, Profile};
use crate::settings::SettingsStore;
use crate::steam::artwork::{self, ArtPaths};
use crate::steam::collections::SteamCollection;

/// `VAPOR_LIBRARY=sample` serves the mockup's sample library instead of the Steam install.
const SOURCE_ENV: &str = "VAPOR_LIBRARY";
const CACHE_FILE: &str = "library-cache.json";
const WATCH_DEBOUNCE: Duration = Duration::from_millis(1500);

/// Emitted when the library changed after a background scan; the UI reloads it.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct LibraryUpdated;

enum Source {
    /// The Steam install and account picked by the settings (re-read at each scan).
    Steam,
    Sample(SampleLibrary),
}

pub struct LibraryService {
    source: Source,
    settings: Arc<SettingsStore>,
    cache_dir: PathBuf,
    /// Art of games outside the snapshot (owned, not installed), found in Steam's library cache.
    extra_art: Mutex<HashMap<AppId, ArtPaths>>,
    snapshot: RwLock<Option<Arc<Snapshot>>>,
    /// Serializes scans (startup refresh, watcher, first-run load).
    scan_lock: Mutex<()>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

impl LibraryService {
    /// Picks the source and loads the cached snapshot, if any. Cheap: no Steam file is parsed.
    pub fn new(cache_dir: PathBuf, settings: Arc<SettingsStore>) -> Self {
        let source = match std::env::var(SOURCE_ENV).as_deref() {
            Ok("sample") => sample::load().map_or(Source::Steam, Source::Sample),
            _ => Source::Steam,
        };
        let cached = match source {
            Source::Steam => load_cache(&cache_dir.join(CACHE_FILE)).map(Arc::new),
            Source::Sample(_) => None,
        };
        Self {
            source,
            settings,
            cache_dir,
            extra_art: Mutex::new(HashMap::new()),
            snapshot: RwLock::new(cached),
            scan_lock: Mutex::new(()),
            watcher: Mutex::new(None),
        }
    }

    pub fn thumbnail_dir(&self) -> PathBuf {
        self.cache_dir.join("thumbnails")
    }

    pub fn cdn_dir(&self) -> PathBuf {
        self.cache_dir.join("cdn")
    }

    /// Whether art missing locally may be downloaded from the Steam CDN (not for the sample).
    pub fn uses_cdn(&self) -> bool {
        matches!(self.source, Source::Steam)
    }

    /// The account's Steam collections (none for the sample library).
    pub fn collections(&self) -> Vec<SteamCollection> {
        match self.source {
            Source::Steam => self
                .current()
                .map(|snapshot| snapshot.collections.clone())
                .unwrap_or_default(),
            Source::Sample(_) => Vec::new(),
        }
    }

    /// Whether games come from the Steam install (Store details and tags apply).
    pub fn is_steam(&self) -> bool {
        matches!(self.source, Source::Steam)
    }

    /// Installed games of the cached snapshot.
    pub fn installed_app_ids(&self) -> Vec<AppId> {
        match self.source {
            Source::Steam => self
                .current()
                .map(|snapshot| snapshot.apps.iter().map(|app| app.app_id).collect())
                .unwrap_or_default(),
            Source::Sample(_) => Vec::new(),
        }
    }

    /// The account whose library is shown (SteamID64).
    pub fn active_account(&self) -> Option<u64> {
        match self.source {
            Source::Steam => self.current()?.account(),
            Source::Sample(_) => None,
        }
    }

    fn current(&self) -> Option<Arc<Snapshot>> {
        self.snapshot
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// The cached snapshot, or a fresh scan on first run.
    fn snapshot_or_scan(&self) -> Result<Arc<Snapshot>, Error> {
        if let Some(snapshot) = self.current() {
            return Ok(snapshot);
        }
        self.refresh()?;
        self.current().ok_or(Error::SteamNotFound)
    }

    pub fn games(&self, enrichment: &Enrichment) -> Result<Vec<Game>, Error> {
        match &self.source {
            Source::Sample(library) => Ok(library.games.clone()),
            Source::Steam => Ok(self.snapshot_or_scan()?.games(enrichment)),
        }
    }

    pub fn profile(&self) -> Result<Profile, Error> {
        match &self.source {
            Source::Sample(library) => Ok(library.profile.clone()),
            Source::Steam => Ok(self.snapshot_or_scan()?.profile()),
        }
    }

    /// File behind a `vapor://` request.
    pub fn image_source(&self, request: &ImageRequest) -> Option<PathBuf> {
        match (&self.source, request) {
            (Source::Sample(library), ImageRequest::Art(app_id, kind)) => library
                .art
                .get(app_id)
                .and_then(|art| kind.source(art))
                .map(Path::to_owned),
            (Source::Sample(_), ImageRequest::Avatar) => None,
            (Source::Steam, ImageRequest::Art(app_id, kind)) => {
                let snapshot = self.current()?;
                if snapshot.apps.iter().any(|app| app.app_id == *app_id) {
                    return snapshot.art_path(*app_id, *kind).map(Path::to_owned);
                }
                self.extra_art_path(*app_id, *kind)
            }
            (Source::Steam, ImageRequest::Avatar) => self.current()?.avatar.clone(),
        }
    }

    /// Steam caches art for games it showed in its library, installed or not.
    fn extra_art_path(&self, app_id: AppId, kind: ImageKind) -> Option<PathBuf> {
        let mut known = self
            .extra_art
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let art = match known.entry(app_id) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => {
                let steam = self.settings.steam_install()?;
                entry.insert(artwork::resolve(
                    &steam.library_cache_dir().join(app_id.to_string()),
                ))
            }
        };
        kind.source(art).map(Path::to_owned)
    }

    /// Rescans Steam. Returns whether anything the UI shows changed.
    pub fn refresh(&self) -> Result<bool, Error> {
        let Source::Steam = &self.source else {
            return Ok(false);
        };
        let steam = self.settings.steam_install().ok_or(Error::SteamNotFound)?;
        let preferred = self.settings.get().steam_id64;
        let _scanning = self
            .scan_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);

        let previous = self.current();
        let fresh = snapshot::scan(&steam, previous.as_deref(), preferred)?;
        let changed = previous.as_deref() != Some(&fresh);
        if changed {
            // A failed cache write only costs the next startup a scan.
            let _ = save_cache(&self.cache_dir, &fresh);
            *self
                .snapshot
                .write()
                .unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(fresh));
        }
        Ok(changed)
    }

    /// Background work after startup: refresh the cached snapshot, sync the Web API data, then
    /// watch Steam's files.
    pub fn start_background(app: AppHandle) {
        std::thread::spawn(move || {
            let Some(service) = tauri::Manager::try_state::<LibraryService>(&app) else {
                return;
            };
            if !matches!(service.source, Source::Steam) {
                return;
            }
            refresh_and_notify(&app);
            EnrichmentService::spawn_sync(app.clone(), false);
            service.watch(app.clone());
        });
    }

    /// After a settings change: rescan, re-watch (folders may differ) and notify.
    pub fn reconfigure(app: &AppHandle) {
        let app = app.clone();
        std::thread::spawn(move || {
            if let Some(service) = tauri::Manager::try_state::<LibraryService>(&app) {
                service
                    .extra_art
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .clear();
            }
            refresh_and_notify(&app);
            if let Some(service) = tauri::Manager::try_state::<LibraryService>(&app) {
                service.watch(app.clone());
            }
        });
    }

    /// Watches manifests, the account list and the account's activity file.
    fn watch(&self, app: AppHandle) {
        let (Some(steam), Some(snapshot)) = (self.settings.steam_install(), self.current()) else {
            return;
        };
        let on_change = move || {
            refresh_and_notify(&app);
            // A game session may have ended: its achievements may have changed.
            EnrichmentService::spawn_sync(app.clone(), false);
        };
        let handler = move |result: DebounceEventResult| {
            let relevant =
                result.is_ok_and(|events| events.iter().any(|event| is_relevant(&event.path)));
            if relevant {
                on_change();
            }
        };
        let Ok(mut debouncer) = new_debouncer(WATCH_DEBOUNCE, handler) else {
            return;
        };
        let mut dirs: Vec<PathBuf> = snapshot
            .folders
            .iter()
            .map(|folder| folder.join("steamapps"))
            .collect();
        dirs.push(steam.config_dir());
        if let Some(user) = &snapshot.user {
            dirs.push(steam.user_config_dir(user.steam_id64));
            dirs.push(steam.user_config_dir(user.steam_id64).join("cloudstorage"));
        }
        for dir in dirs {
            // A library on an unplugged drive is simply not watched.
            let _ = debouncer.watcher().watch(&dir, RecursiveMode::NonRecursive);
        }
        *self.watcher.lock().unwrap_or_else(PoisonError::into_inner) = Some(debouncer);
    }
}

fn refresh_and_notify(app: &AppHandle) {
    if let Some(service) = tauri::Manager::try_state::<LibraryService>(app)
        && matches!(service.refresh(), Ok(true))
    {
        let _ = LibraryUpdated.emit(app);
    }
}

fn is_relevant(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    (name.starts_with("appmanifest_") && name.ends_with(".acf"))
        || matches!(
            name,
            "libraryfolders.vdf"
                | "loginusers.vdf"
                | "localconfig.vdf"
                | "cloud-storage-namespace-1.json"
        )
}

fn load_cache(file: &Path) -> Option<Snapshot> {
    let bytes = std::fs::read(file).ok()?;
    let snapshot: Snapshot = serde_json::from_slice(&bytes).ok()?;
    (snapshot.version == SNAPSHOT_VERSION).then_some(snapshot)
}

fn save_cache(dir: &Path, snapshot: &Snapshot) -> Result<(), Error> {
    let io_error = |source| Error::Io {
        path: dir.join(CACHE_FILE),
        source,
    };
    std::fs::create_dir_all(dir).map_err(io_error)?;
    let partial = dir.join(format!("{CACHE_FILE}.tmp"));
    std::fs::write(&partial, serde_json::to_vec(snapshot)?).map_err(io_error)?;
    std::fs::rename(&partial, dir.join(CACHE_FILE)).map_err(io_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reacts_only_to_files_vapor_reads() {
        assert!(is_relevant(Path::new(
            "D:/SteamLibrary/steamapps/appmanifest_504230.acf"
        )));
        assert!(is_relevant(Path::new(
            "C:/Steam/userdata/1/config/localconfig.vdf"
        )));
        assert!(!is_relevant(Path::new("C:/Steam/config/config.vdf")));
        assert!(!is_relevant(Path::new(
            "D:/SteamLibrary/steamapps/downloading"
        )));
    }

    #[test]
    fn cache_round_trips_and_rejects_other_versions() {
        let dir = std::env::temp_dir().join(format!("vapor-cache-test-{}", std::process::id()));
        let snapshot = Snapshot {
            version: SNAPSHOT_VERSION,
            ..Snapshot::default()
        };
        save_cache(&dir, &snapshot).unwrap();
        assert_eq!(load_cache(&dir.join(CACHE_FILE)), Some(snapshot));

        let old = Snapshot {
            version: SNAPSHOT_VERSION + 1,
            ..Snapshot::default()
        };
        save_cache(&dir, &old).unwrap();
        assert_eq!(load_cache(&dir.join(CACHE_FILE)), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
