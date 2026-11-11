//! What Vapor reads from Steam, cached between launches: raw facts, not UI objects. The `Game`
//! list the UI consumes is derived from it on demand (cheap), so the cache format and the UI
//! contract can evolve separately.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::images::{self, ImageKind};
use crate::model::{AppId, Game, Profile};
use crate::steam::activity::{self, AppActivity};
use crate::steam::artwork::{self, ArtPaths};
use crate::steam::manifests::{self, InstalledApp};
use crate::steam::users::{self, SteamUser};
use crate::steam::{SteamInstall, libraries, non_games};

/// Bump when the shape changes; older cache files are then ignored and rebuilt.
pub const SNAPSHOT_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: u32,
    /// Steam library folders (one per drive).
    pub folders: Vec<PathBuf>,
    /// Installed games (non-games filtered out), sorted by app ID.
    pub apps: Vec<InstalledApp>,
    pub activity: BTreeMap<AppId, AppActivity>,
    pub art: BTreeMap<AppId, Art>,
    pub user: Option<SteamUser>,
    pub avatar: Option<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Art {
    pub paths: ArtPaths,
    /// Result of the dark-logo check, for the logo file identified by `logo_stamp`.
    pub logo_dark: bool,
    pub logo_stamp: Option<FileStamp>,
}

/// Identifies a file version without reading it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileStamp {
    len: u64,
    modified: u64,
}

impl FileStamp {
    fn of(path: &Path) -> Option<Self> {
        let metadata = std::fs::metadata(path).ok()?;
        let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
        Some(Self {
            len: metadata.len(),
            modified: modified.as_secs(),
        })
    }
}

/// Reads the Steam install. `previous` lets unchanged logos skip their (image decoding) check.
pub fn scan(steam: &SteamInstall, previous: Option<&Snapshot>) -> Result<Snapshot, Error> {
    let folders = libraries::read(&steam.library_folders_file(), steam.root())
        .unwrap_or_else(|_| vec![steam.root().to_owned()]);

    let mut apps: Vec<InstalledApp> = folders
        .iter()
        .flat_map(|folder| manifests::read_library(folder))
        .filter(|app| !non_games::is_non_game(app.app_id, &app.name))
        .collect();
    apps.sort_by_key(|app| app.app_id);
    apps.dedup_by_key(|app| app.app_id);

    // A missing or unreadable account only loses playtime and the profile, not the library.
    let user = users::read_active(&steam.login_users_file()).ok().flatten();
    let mut all_activity = user
        .as_ref()
        .and_then(|user| {
            activity::read(
                &steam
                    .user_config_dir(user.steam_id64)
                    .join("localconfig.vdf"),
            )
            .ok()
        })
        .unwrap_or_default();
    let activity = apps
        .iter()
        .filter_map(|app| Some((app.app_id, all_activity.remove(&app.app_id)?)))
        .collect();

    let cache_dir = steam.library_cache_dir();
    let resolved: Vec<(AppId, ArtPaths)> = apps
        .iter()
        .map(|app| {
            (
                app.app_id,
                artwork::resolve(&cache_dir.join(app.app_id.to_string())),
            )
        })
        .collect();
    let art = check_logos(resolved, previous);

    let avatar = user
        .as_ref()
        .map(|user| steam.avatar_file(user.steam_id64))
        .filter(|path| path.is_file());

    Ok(Snapshot {
        version: SNAPSHOT_VERSION,
        folders,
        apps,
        activity,
        art,
        user,
        avatar,
    })
}

/// Runs the dark-logo check for new or changed logos, in parallel; reuses earlier results.
fn check_logos(
    resolved: Vec<(AppId, ArtPaths)>,
    previous: Option<&Snapshot>,
) -> BTreeMap<AppId, Art> {
    let mut art = BTreeMap::new();
    let mut to_check = Vec::new();
    for (app_id, paths) in resolved {
        let stamp = paths.logo.as_deref().and_then(FileStamp::of);
        let known = previous
            .and_then(|snapshot| snapshot.art.get(&app_id))
            .filter(|old| {
                old.paths.logo == paths.logo && old.logo_stamp == stamp && stamp.is_some()
            });
        match known {
            Some(old) => {
                art.insert(
                    app_id,
                    Art {
                        paths,
                        logo_dark: old.logo_dark,
                        logo_stamp: stamp,
                    },
                );
            }
            None => to_check.push((app_id, paths, stamp)),
        }
    }

    let workers = std::thread::available_parallelism().map_or(4, |count| count.get());
    let chunk_size = to_check.len().div_ceil(workers).max(1);
    std::thread::scope(|scope| {
        let handles: Vec<_> = to_check
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|(app_id, paths, stamp)| {
                            // An unreadable logo is treated as dark: fall back to the name.
                            let logo_dark = paths
                                .logo
                                .as_deref()
                                .is_some_and(|logo| images::is_dark_logo(logo).unwrap_or(true));
                            (
                                *app_id,
                                Art {
                                    paths: paths.clone(),
                                    logo_dark,
                                    logo_stamp: *stamp,
                                },
                            )
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        for handle in handles {
            if let Ok(results) = handle.join() {
                art.extend(results);
            }
        }
    });
    art
}

impl Snapshot {
    pub fn games(&self) -> Vec<Game> {
        let no_activity = AppActivity::default();
        self.apps
            .iter()
            .map(|app| {
                let activity = self.activity.get(&app.app_id).unwrap_or(&no_activity);
                let art = self.art.get(&app.app_id);
                let images = art.map_or_else(Default::default, |art| {
                    images::game_images(app.app_id, &art.paths, !art.logo_dark)
                });
                Game {
                    app_id: app.app_id,
                    name: app.name.clone(),
                    // Genres, modes and tags come from the Store API (Phase 4).
                    genre: None,
                    modes: Vec::new(),
                    tags: Vec::new(),
                    installed: Some(app.fully_installed()),
                    playtime_minutes: activity.playtime_minutes,
                    last_played: activity.last_played.map(iso8601_utc),
                    achievements: None,
                    cloud: activity.cloud(),
                    update_pending: Some(app.update_required()),
                    images,
                }
            })
            .collect()
    }

    pub fn profile(&self) -> Profile {
        Profile {
            persona_name: self
                .user
                .as_ref()
                .map(|user| user.persona_name.clone())
                .filter(|name| !name.is_empty()),
            avatar: self.avatar.as_ref().map(|_| images::avatar_url()),
        }
    }

    pub fn art_path(&self, app_id: AppId, kind: ImageKind) -> Option<&Path> {
        self.art
            .get(&app_id)
            .and_then(|art| kind.source(&art.paths))
    }
}

/// Unix seconds to `YYYY-MM-DDTHH:MM:SSZ` (proleptic Gregorian, H. Hinnant's days-from-civil).
pub fn iso8601_utc(unix_seconds: u64) -> String {
    let days = i64::try_from(unix_seconds / 86_400).unwrap_or_default();
    let seconds_of_day = unix_seconds % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_unix_time_as_iso8601() {
        assert_eq!(iso8601_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601_utc(1_767_717_569), "2026-01-06T16:39:29Z");
        assert_eq!(iso8601_utc(951_782_400), "2000-02-29T00:00:00Z");
    }
}

/// Scans this machine's Steam install and prints a summary. Not part of the normal suite:
/// `cargo test real_install -- --ignored --nocapture`
#[cfg(test)]
mod real_install {
    use super::*;

    #[test]
    #[ignore = "reads the local Steam install"]
    fn real_install_summary() {
        let steam = SteamInstall::locate().unwrap();
        let start = std::time::Instant::now();
        let snapshot = scan(&steam, None).unwrap();
        let cold = start.elapsed();
        let start = std::time::Instant::now();
        let again = scan(&steam, Some(&snapshot)).unwrap();
        let warm = start.elapsed();
        assert_eq!(snapshot, again);

        let games = snapshot.games();
        let count = |f: &dyn Fn(&Game) -> bool| games.iter().filter(|g| f(g)).count();
        println!("steam root: {}", steam.root().display());
        println!("folders: {:?}", snapshot.folders);
        println!("user: {:?}", snapshot.profile());
        println!("games: {}", games.len());
        println!("  with cover: {}", count(&|g| g.images.cover.is_some()));
        println!("  with hero: {}", count(&|g| g.images.hero.is_some()));
        println!(
            "  with readable logo: {}",
            count(&|g| g.images.logo.is_some())
        );
        println!(
            "  with playtime: {}",
            count(&|g| g.playtime_minutes.is_some())
        );
        println!(
            "  with last played: {}",
            count(&|g| g.last_played.is_some())
        );
        println!("  cloud synced: {}", count(&|g| g.cloud.is_some()));
        println!(
            "  update pending: {}",
            count(&|g| g.update_pending == Some(true))
        );
        for (app_id, art) in &snapshot.art {
            if art.logo_dark {
                println!("  dark logo: {app_id}");
            }
            if art.paths.cover.is_none() {
                println!("  no cover: {app_id}");
            }
        }
        println!("scan: {cold:?} cold, {warm:?} with previous snapshot");
    }
}
