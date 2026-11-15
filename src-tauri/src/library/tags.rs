//! Genre, modes and vibe tags of a game, derived from its Store details (genres, categories)
//! through an editable mapping, then adjusted by the user's own tag edits.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};

use serde::{Deserialize, Serialize};

use crate::enrichment::StoreEntry;
use crate::error::Error;
use crate::model::{AppId, Game, Mode};
use crate::web::store_api::StoreDetails;

const DEFAULT_MAPPING: &str = include_str!("vibe-mapping.json");
const MAPPING_FILE: &str = "vibe-mapping.json";
const USER_TAGS_FILE: &str = "user-tags.json";

/// Store genres that describe a business model or audience rather than what the game is.
const META_GENRES: &[&str] = &[
    "Indie",
    "Free To Play",
    "Free to Play",
    "Early Access",
    "Massively Multiplayer",
];

/// Store category IDs per mode.
const SOLO_CATEGORIES: &[u32] = &[2];
const COOP_CATEGORIES: &[u32] = &[9, 38, 39, 48];
const PVP_CATEGORIES: &[u32] = &[36, 37, 47, 49];

/// Store app types shown in the library (others are software, DLC, soundtracks…).
const PLAYABLE_TYPES: &[&str] = &["game", "demo", "mod"];

#[derive(Debug, Clone, Default, Deserialize)]
pub struct VibeMapping {
    #[serde(default)]
    genres: HashMap<String, Vec<String>>,
    /// Category ID (as a string key) → tags.
    #[serde(default)]
    categories: HashMap<String, Vec<String>>,
}

impl VibeMapping {
    /// The user's `vibe-mapping.json` if present and valid, else the bundled default.
    pub fn load(config_dir: &Path) -> Self {
        std::fs::read(config_dir.join(MAPPING_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(Self::bundled)
    }

    fn bundled() -> Self {
        serde_json::from_str(DEFAULT_MAPPING).unwrap_or_default()
    }

    /// Tags for these details, in mapping order, without duplicates.
    pub fn tags(&self, details: &StoreDetails) -> Vec<String> {
        let from_genres = details
            .genres
            .iter()
            .filter_map(|genre| self.genres.get(genre));
        let from_categories = details
            .categories
            .iter()
            .filter_map(|category| self.categories.get(&category.to_string()));
        let mut tags: Vec<String> = Vec::new();
        for tag in from_genres.chain(from_categories).flatten() {
            if !tags.contains(tag) {
                tags.push(tag.clone());
            }
        }
        tags
    }
}

/// The genre shown for a game: the first that says what it is (not "Indie", "Free To Play"…).
pub fn primary_genre(details: &StoreDetails) -> Option<String> {
    details
        .genres
        .iter()
        .find(|genre| !META_GENRES.contains(&genre.as_str()))
        .or_else(|| details.genres.first())
        .cloned()
}

pub fn modes(details: &StoreDetails) -> Vec<Mode> {
    let has = |ids: &[u32]| details.categories.iter().any(|id| ids.contains(id));
    [
        (Mode::Solo, SOLO_CATEGORIES),
        (Mode::Coop, COOP_CATEGORIES),
        (Mode::PvP, PVP_CATEGORIES),
    ]
    .into_iter()
    .filter(|(_, ids)| has(ids))
    .map(|(mode, _)| mode)
    .collect()
}

pub fn is_playable(details: &StoreDetails) -> bool {
    PLAYABLE_TYPES.contains(&details.app_type.as_str())
}

/// The user's changes to a game's mapped tags.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagEdits {
    #[serde(default)]
    pub added: Vec<String>,
    #[serde(default)]
    pub removed: Vec<String>,
    /// The user's genre, replacing the mapped one (`""`: no genre).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The user's modes, replacing the mapped ones.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modes: Option<Vec<Mode>>,
}

/// Genre, modes and vibe tags of a game.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Classification {
    pub genre: Option<String>,
    pub modes: Vec<Mode>,
    pub tags: Vec<String>,
}

impl Classification {
    pub fn of(game: &Game) -> Self {
        Self {
            genre: game.genre.clone(),
            modes: game.modes.clone(),
            tags: game.tags.clone(),
        }
    }
}

impl TagEdits {
    /// Tag edits that turn `mapped` into `wanted`.
    pub fn between(mapped: &[String], wanted: &[String]) -> Self {
        Self {
            genre: None,
            modes: None,
            added: wanted
                .iter()
                .filter(|tag| !mapped.contains(tag))
                .cloned()
                .collect(),
            removed: mapped
                .iter()
                .filter(|tag| !wanted.contains(tag))
                .cloned()
                .collect(),
        }
    }

    pub fn apply(&self, mapped: &[String]) -> Vec<String> {
        mapped
            .iter()
            .filter(|tag| !self.removed.contains(tag))
            .chain(self.added.iter().filter(|tag| !mapped.contains(tag)))
            .cloned()
            .collect()
    }

    fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.removed.is_empty()
            && self.genre.is_none()
            && self.modes.is_none()
    }

    fn apply_all(&self, base: Classification) -> Classification {
        Classification {
            genre: match &self.genre {
                Some(genre) if genre.is_empty() => None,
                Some(genre) => Some(genre.clone()),
                None => base.genre,
            },
            modes: self.modes.clone().unwrap_or(base.modes),
            tags: self.apply(&base.tags),
        }
    }
}

/// Applies Store details, the vibe mapping and the user's tag edits to games.
pub struct Tagging {
    mapping: VibeMapping,
    user_file: PathBuf,
    user: RwLock<BTreeMap<AppId, TagEdits>>,
}

impl Tagging {
    pub fn load(config_dir: &Path) -> Self {
        let user_file = config_dir.join(USER_TAGS_FILE);
        let user = std::fs::read(&user_file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            mapping: VibeMapping::load(config_dir),
            user_file,
            user: RwLock::new(user),
        }
    }

    /// The classification a game has before the user's edits: from its Store details, else
    /// what it came with (nothing for Steam games, the sample's own values for the sample).
    pub fn base(&self, game: &Game, details: Option<&StoreDetails>) -> Classification {
        match details {
            Some(details) => Classification {
                genre: primary_genre(details),
                modes: modes(details),
                tags: self.mapping.tags(details),
            },
            None => Classification::of(game),
        }
    }

    /// Fills genre, modes and tags, and drops apps the Store says are not games.
    pub fn apply(&self, games: &mut Vec<Game>, store: &BTreeMap<AppId, StoreEntry>) {
        let user = self.user.read().unwrap_or_else(PoisonError::into_inner);
        let details = |app_id: AppId| store.get(&app_id).and_then(|entry| entry.details.as_ref());
        games.retain(|game| details(game.app_id).is_none_or(is_playable));
        for game in games.iter_mut() {
            let base = self.base(game, details(game.app_id));
            let Classification { genre, modes, tags } = match user.get(&game.app_id) {
                Some(edits) => edits.apply_all(base),
                None => base,
            };
            game.genre = genre;
            game.modes = modes;
            game.tags = tags;
        }
    }

    /// Saves the user's vibe tags for a game, keeping any genre or mode edit.
    pub fn set_tags(
        &self,
        app_id: AppId,
        tags: Vec<String>,
        base: &Classification,
    ) -> Result<(), Error> {
        let current = self
            .user
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&app_id)
            .cloned()
            .unwrap_or_default();
        let wanted = Classification {
            tags,
            ..current.apply_all(base.clone())
        };
        self.set_classification(app_id, wanted, base)
    }

    /// Saves the user's genre, modes and tags as edits relative to `base`.
    pub fn set_classification(
        &self,
        app_id: AppId,
        wanted: Classification,
        base: &Classification,
    ) -> Result<(), Error> {
        let tags: Vec<String> = wanted
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_owned())
            .filter(|tag| !tag.is_empty())
            .collect();
        let genre = wanted
            .genre
            .map(|genre| genre.trim().to_owned())
            .filter(|genre| !genre.is_empty());
        let same_modes = wanted.modes.len() == base.modes.len()
            && wanted.modes.iter().all(|mode| base.modes.contains(mode));
        let edits = TagEdits {
            genre: (genre != base.genre).then(|| genre.unwrap_or_default()),
            modes: (!same_modes).then_some(wanted.modes),
            ..TagEdits::between(&base.tags, &tags)
        };
        let mut user = self.user.write().unwrap_or_else(PoisonError::into_inner);
        if edits.is_empty() {
            user.remove(&app_id);
        } else {
            user.insert(app_id, edits);
        }
        let io_error = |source| Error::Io {
            path: self.user_file.clone(),
            source,
        };
        if let Some(dir) = self.user_file.parent() {
            std::fs::create_dir_all(dir).map_err(io_error)?;
        }
        std::fs::write(&self.user_file, serde_json::to_vec_pretty(&*user)?).map_err(io_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn details(genres: &[&str], categories: &[u32]) -> StoreDetails {
        StoreDetails {
            app_type: "game".into(),
            genres: genres.iter().map(|genre| (*genre).to_owned()).collect(),
            categories: categories.to_vec(),
            developers: None,
        }
    }

    #[test]
    fn bundled_mapping_parses() {
        let mapping = VibeMapping::bundled();
        let tags = mapping.tags(&details(&["Indie", "Adventure"], &[2, 49]));
        assert_eq!(tags, ["Indie", "Story", "Exploration", "Competitive"]);
    }

    #[test]
    fn picks_a_descriptive_primary_genre() {
        assert_eq!(
            primary_genre(&details(&["Indie", "Platformer"], &[])),
            Some("Platformer".into())
        );
        assert_eq!(
            primary_genre(&details(&["Indie"], &[])),
            Some("Indie".into())
        );
        assert_eq!(primary_genre(&details(&[], &[])), None);
    }

    #[test]
    fn maps_categories_to_modes() {
        assert_eq!(
            modes(&details(&[], &[2, 38, 49])),
            [Mode::Solo, Mode::Coop, Mode::PvP]
        );
        assert_eq!(modes(&details(&[], &[22, 23])), []);
    }

    #[test]
    fn user_edits_add_and_remove_mapped_tags() {
        let mapped = vec!["Indie".to_owned(), "Story".to_owned()];
        let wanted = vec!["Indie".to_owned(), "Hard".to_owned()];
        let edits = TagEdits::between(&mapped, &wanted);
        assert_eq!(edits.added, ["Hard"]);
        assert_eq!(edits.removed, ["Story"]);
        assert_eq!(edits.apply(&mapped), wanted);
        // If the mapping later adds a tag, the user's edits still apply on top.
        let remapped = vec!["Indie".to_owned(), "Story".to_owned(), "Chill".to_owned()];
        assert_eq!(edits.apply(&remapped), ["Indie", "Chill", "Hard"]);
    }

    #[test]
    fn genre_and_mode_edits_replace_the_mapped_ones() {
        let dir = std::env::temp_dir().join(format!("vapor-tags-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let tagging = Tagging::load(&dir);
        let edits = |app_id| tagging.user.read().unwrap().get(&app_id).cloned();
        let base = Classification {
            genre: Some("Platformer".into()),
            modes: vec![Mode::Solo],
            tags: vec!["Indie".into()],
        };
        let wanted = Classification {
            genre: Some("Adventure".into()),
            modes: vec![Mode::Solo, Mode::Coop],
            tags: vec!["Indie".into(), "Hard".into()],
        };
        tagging
            .set_classification(1, wanted.clone(), &base)
            .unwrap();
        assert_eq!(edits(1).unwrap().apply_all(base.clone()), wanted);

        // Editing only the tags keeps the genre and mode edits.
        tagging.set_tags(1, vec!["Story".into()], &base).unwrap();
        assert_eq!(
            edits(1).unwrap().apply_all(base.clone()),
            Classification {
                tags: vec!["Story".into()],
                ..wanted
            }
        );

        // Back to the base: nothing kept.
        tagging.set_classification(1, base.clone(), &base).unwrap();
        assert_eq!(edits(1), None);

        // No genre at all.
        let no_genre = Classification {
            genre: None,
            ..base.clone()
        };
        tagging
            .set_classification(1, no_genre.clone(), &base)
            .unwrap();
        assert_eq!(edits(1).unwrap().apply_all(base), no_genre);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_games_demos_and_mods_are_playable() {
        let mut software = details(&[], &[]);
        software.app_type = "application".into();
        assert!(!is_playable(&software));
        assert!(is_playable(&details(&[], &[])));
    }
}
