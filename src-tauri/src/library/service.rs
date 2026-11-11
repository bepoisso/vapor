//! The library the UI shows. Startup serves Vapor's cached snapshot (no Steam file is read on the
//! critical path), a background scan refreshes it, and a file watcher keeps it current while
//! Vapor runs. The UI is told through the `LibraryUpdated` event.

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
use crate::error::Error;
use crate::images::ImageRequest;
use crate::model::{Game, Profile};
use crate::steam::SteamInstall;

/// `VAPOR_LIBRARY=sample` serves the mockup's sample library instead of the Steam install.
const SOURCE_ENV: &str = "VAPOR_LIBRARY";
const CACHE_FILE: &str = "library-cache.json";
const WATCH_DEBOUNCE: Duration = Duration::from_millis(1500);

/// Emitted when the library changed after a background scan; the UI reloads it.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct LibraryUpdated;

enum Source {
    /// `None` when no Steam install was found.
    Steam(Option<SteamInstall>),
    Sample(SampleLibrary),
}

pub struct LibraryService {
    source: Source,
    cache_dir: PathBuf,
    snapshot: RwLock<Option<Arc<Snapshot>>>,
    /// Serializes scans (startup refresh, watcher, first-run load).
    scan_lock: Mutex<()>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

impl LibraryService {
    /// Picks the source and loads the cached snapshot, if any. Cheap: no Steam file is parsed.
    pub fn new(cache_dir: PathBuf) -> Self {
        let source = match std::env::var(SOURCE_ENV).as_deref() {
            Ok("sample") => match sample::load() {
                Ok(library) => Source::Sample(library),
                Err(_) => Source::Steam(SteamInstall::locate().ok()),
            },
            _ => Source::Steam(SteamInstall::locate().ok()),
        };
        let cached = match source {
            Source::Steam(Some(_)) => load_cache(&cache_dir.join(CACHE_FILE)).map(Arc::new),
            _ => None,
        };
        Self {
            source,
            cache_dir,
            snapshot: RwLock::new(cached),
            scan_lock: Mutex::new(()),
            watcher: Mutex::new(None),
        }
    }

    pub fn thumbnail_dir(&self) -> PathBuf {
        self.cache_dir.join("thumbnails")
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

    pub fn games(&self) -> Result<Vec<Game>, Error> {
        match &self.source {
            Source::Sample(library) => Ok(library.games.clone()),
            Source::Steam(_) => Ok(self.snapshot_or_scan()?.games()),
        }
    }

    pub fn profile(&self) -> Result<Profile, Error> {
        match &self.source {
            Source::Sample(library) => Ok(library.profile.clone()),
            Source::Steam(_) => Ok(self.snapshot_or_scan()?.profile()),
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
            (Source::Steam(_), ImageRequest::Art(app_id, kind)) => {
                self.current()?.art_path(*app_id, *kind).map(Path::to_owned)
            }
            (Source::Steam(_), ImageRequest::Avatar) => self.current()?.avatar.clone(),
        }
    }

    /// Rescans Steam. Returns whether anything the UI shows changed.
    pub fn refresh(&self) -> Result<bool, Error> {
        let Source::Steam(steam) = &self.source else {
            return Ok(false);
        };
        let steam = steam.as_ref().ok_or(Error::SteamNotFound)?;
        let _scanning = self
            .scan_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);

        let previous = self.current();
        let fresh = snapshot::scan(steam, previous.as_deref())?;
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

    /// Background work after startup: refresh the cached snapshot, then watch Steam's files.
    pub fn start_background(app: AppHandle, service: &Self) {
        if !matches!(service.source, Source::Steam(Some(_))) {
            return;
        }
        let refresh_and_notify = {
            let app = app.clone();
            move || {
                if let Some(service) = tauri::Manager::try_state::<LibraryService>(&app)
                    && matches!(service.refresh(), Ok(true))
                {
                    let _ = LibraryUpdated.emit(&app);
                }
            }
        };
        let notify_after_scan = refresh_and_notify.clone();
        std::thread::spawn(move || {
            notify_after_scan();
            if let Some(service) = tauri::Manager::try_state::<LibraryService>(&app) {
                service.watch(refresh_and_notify);
            }
        });
    }

    /// Watches manifests, the account list and the account's activity file.
    fn watch(&self, on_change: impl Fn() + Clone + Send + 'static) {
        let (Source::Steam(Some(steam)), Some(snapshot)) = (&self.source, self.current()) else {
            return;
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
        }
        for dir in dirs {
            // A library on an unplugged drive is simply not watched.
            let _ = debouncer.watcher().watch(&dir, RecursiveMode::NonRecursive);
        }
        *self.watcher.lock().unwrap_or_else(PoisonError::into_inner) = Some(debouncer);
    }
}

fn is_relevant(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    (name.starts_with("appmanifest_") && name.ends_with(".acf"))
        || matches!(
            name,
            "libraryfolders.vdf" | "loginusers.vdf" | "localconfig.vdf"
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
