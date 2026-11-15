//! What the user sets on the game page, kept by Vapor only (`game-data.json` in the config dir):
//! favorites, games hidden from the library, and notes. Never synced anywhere; Steam's own files
//! are never written.
//!
//! Favorites are kept as changes to Steam's "Favorites" collection, so a game favorited in
//! Steam stays a favorite until the user unfavorites it in Vapor.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::model::AppId;

const FILE: &str = "game-data.json";
/// Notes longer than this are cut (they are personal notes, not documents).
const MAX_NOTES_CHARS: usize = 20_000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
struct Data {
    favorites_added: BTreeSet<AppId>,
    favorites_removed: BTreeSet<AppId>,
    hidden: BTreeSet<AppId>,
    notes: BTreeMap<AppId, String>,
}

pub struct GameUserData {
    file: PathBuf,
    data: RwLock<Data>,
}

impl GameUserData {
    pub fn load(config_dir: &Path) -> Self {
        let file = config_dir.join(FILE);
        let data = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            file,
            data: RwLock::new(data),
        }
    }

    fn read(&self) -> std::sync::RwLockReadGuard<'_, Data> {
        self.data.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn update(&self, change: impl FnOnce(&mut Data)) -> Result<(), Error> {
        let mut data = self.data.write().unwrap_or_else(PoisonError::into_inner);
        let mut next = data.clone();
        change(&mut next);
        let io_error = |source| Error::Io {
            path: self.file.clone(),
            source,
        };
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir).map_err(io_error)?;
        }
        let partial = self.file.with_extension("json.tmp");
        std::fs::write(&partial, serde_json::to_vec_pretty(&next)?).map_err(io_error)?;
        std::fs::rename(&partial, &self.file).map_err(io_error)?;
        *data = next;
        Ok(())
    }

    pub fn is_favorite(&self, app_id: AppId, in_steam_favorites: bool) -> bool {
        let data = self.read();
        (in_steam_favorites || data.favorites_added.contains(&app_id))
            && !data.favorites_removed.contains(&app_id)
    }

    pub fn set_favorite(
        &self,
        app_id: AppId,
        favorite: bool,
        in_steam_favorites: bool,
    ) -> Result<(), Error> {
        self.update(|data| {
            data.favorites_added.remove(&app_id);
            data.favorites_removed.remove(&app_id);
            match (favorite, in_steam_favorites) {
                (true, false) => {
                    data.favorites_added.insert(app_id);
                }
                (false, true) => {
                    data.favorites_removed.insert(app_id);
                }
                _ => {}
            }
        })
    }

    /// Steam's favorites with the user's changes: Steam's order, then games added in Vapor.
    pub fn favorites(&self, steam_favorites: &[AppId]) -> Vec<AppId> {
        let data = self.read();
        steam_favorites
            .iter()
            .copied()
            .filter(|app_id| !data.favorites_added.contains(app_id))
            .chain(data.favorites_added.iter().copied())
            .filter(|app_id| !data.favorites_removed.contains(app_id))
            .collect()
    }

    pub fn is_hidden(&self, app_id: AppId) -> bool {
        self.read().hidden.contains(&app_id)
    }

    pub fn hidden(&self) -> BTreeSet<AppId> {
        self.read().hidden.clone()
    }

    pub fn set_hidden(&self, app_id: AppId, hidden: bool) -> Result<(), Error> {
        self.update(|data| {
            if hidden {
                data.hidden.insert(app_id);
            } else {
                data.hidden.remove(&app_id);
            }
        })
    }

    pub fn notes(&self, app_id: AppId) -> String {
        self.read().notes.get(&app_id).cloned().unwrap_or_default()
    }

    pub fn set_notes(&self, app_id: AppId, notes: &str) -> Result<(), Error> {
        let notes: String = notes.chars().take(MAX_NOTES_CHARS).collect();
        if self.notes(app_id) == notes {
            return Ok(());
        }
        self.update(|data| {
            if notes.trim().is_empty() {
                data.notes.remove(&app_id);
            } else {
                data.notes.insert(app_id, notes);
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(name: &str) -> (GameUserData, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("vapor-game-data-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        (GameUserData::load(&dir), dir)
    }

    #[test]
    fn favorites_are_changes_to_steams_collection() {
        let (data, dir) = store("favorites");
        let steam = [504230, 620];
        data.set_favorite(620, false, true).unwrap();
        data.set_favorite(1145360, true, false).unwrap();
        assert!(!data.is_favorite(620, true));
        assert!(data.is_favorite(504230, true));
        assert!(data.is_favorite(1145360, false));
        assert_eq!(data.favorites(&steam), [504230, 1145360]);
        // Back to Steam's state: no change kept.
        data.set_favorite(620, true, true).unwrap();
        assert_eq!(data.favorites(&steam), [504230, 620, 1145360]);
        // Persisted.
        assert_eq!(
            GameUserData::load(&dir).favorites(&steam),
            [504230, 620, 1145360]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn hides_and_notes() {
        let (data, dir) = store("hidden");
        data.set_hidden(730, true).unwrap();
        assert!(data.is_hidden(730));
        data.set_notes(730, "Try the AWP").unwrap();
        data.set_notes(220, "   ").unwrap();
        let reloaded = GameUserData::load(&dir);
        assert_eq!(reloaded.notes(730), "Try the AWP");
        assert_eq!(reloaded.notes(220), "");
        reloaded.set_hidden(730, false).unwrap();
        assert!(!reloaded.is_hidden(730));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
