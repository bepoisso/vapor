//! Data the local Steam files don't have, fetched with the user's Steam Web API key: every owned
//! game (not only installed ones) and achievements. Cached on disk; synced in the background.

pub mod service;

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::model::AppId;
use crate::web::steam_api::OwnedGame;
use crate::web::store_api::StoreDetails;

const CACHE_FILE: &str = "enrichment-cache.json";
/// Bump when the shape changes; older cache files are then ignored.
const VERSION: u32 = 1;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Enrichment {
    pub version: u32,
    /// The account (SteamID64) the data below belongs to.
    pub account: Option<u64>,
    pub owned: Vec<OwnedGame>,
    /// Unix seconds of the last successful `GetOwnedGames`.
    pub owned_synced_at: Option<u64>,
    pub achievements: BTreeMap<AppId, Achievements>,
    /// Store details (opt-in). Not tied to the account: the Store is the same for everyone.
    pub store: BTreeMap<AppId, StoreEntry>,
    /// Last sync failure, shown in Settings (never contains the key).
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Achievements {
    /// `last_played` of the game when fetched: refetch once it was played again.
    pub fetched_for: Option<u64>,
    pub unlocked: u32,
    /// 0 when the game has no achievements.
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreEntry {
    /// Unix seconds.
    pub fetched_at: u64,
    /// `None` when the Store has no page for the app.
    pub details: Option<StoreDetails>,
}

/// Store details are refreshed after this long (genres and categories rarely change).
pub const STORE_MAX_AGE_SECS: u64 = 30 * 24 * 3600;

impl Enrichment {
    pub fn load(dir: &Path) -> Self {
        std::fs::read(dir.join(CACHE_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Self>(&bytes).ok())
            .filter(|enrichment| enrichment.version == VERSION)
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> Result<(), Error> {
        let path = dir.join(CACHE_FILE);
        let io_error = |source| Error::Io {
            path: path.clone(),
            source,
        };
        std::fs::create_dir_all(dir).map_err(io_error)?;
        let partial = path.with_extension("json.tmp");
        std::fs::write(&partial, serde_json::to_vec(self)?).map_err(io_error)?;
        std::fs::rename(&partial, &path).map_err(io_error)
    }

    /// Empty account data for `account` (switching account or removing the key). Store details
    /// are kept: they do not depend on the account.
    pub fn reset(account: Option<u64>, store: BTreeMap<AppId, StoreEntry>) -> Self {
        Self {
            version: VERSION,
            account,
            store,
            ..Self::default()
        }
    }

    /// Apps among `app_ids` whose Store details are missing or older than a month.
    pub fn stale_store(&self, app_ids: &[AppId], now: u64) -> Vec<AppId> {
        app_ids
            .iter()
            .copied()
            .filter(|app_id| {
                self.store
                    .get(app_id)
                    .is_none_or(|entry| now.saturating_sub(entry.fetched_at) > STORE_MAX_AGE_SECS)
            })
            .collect()
    }

    /// Games whose achievements are missing or older than their last session.
    pub fn stale_achievements(&self) -> Vec<AppId> {
        self.owned
            .iter()
            .filter(|game| game.playtime_minutes > 0)
            .filter(|game| {
                self.achievements
                    .get(&game.app_id)
                    .is_none_or(|known| known.fetched_for != game.last_played)
            })
            .map(|game| game.app_id)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn owned(app_id: AppId, playtime_minutes: u32, last_played: Option<u64>) -> OwnedGame {
        OwnedGame {
            app_id,
            name: format!("Game {app_id}"),
            playtime_minutes,
            last_played,
        }
    }

    #[test]
    fn refetches_achievements_only_for_games_played_since() {
        let mut enrichment = Enrichment::reset(Some(1), BTreeMap::new());
        enrichment.owned = vec![
            owned(1, 100, Some(10)),
            owned(2, 100, Some(20)),
            owned(3, 0, None), // never played: nothing to fetch
            owned(4, 50, Some(40)),
        ];
        let known = |fetched_for| Achievements {
            fetched_for,
            unlocked: 1,
            total: 2,
        };
        enrichment.achievements.insert(1, known(Some(10)));
        enrichment.achievements.insert(2, known(Some(15)));
        assert_eq!(enrichment.stale_achievements(), vec![2, 4]);
    }

    #[test]
    fn refreshes_store_details_older_than_a_month() {
        let mut enrichment = Enrichment::reset(None, BTreeMap::new());
        let now = 100 * 24 * 3600;
        let entry = |fetched_at| StoreEntry {
            fetched_at,
            details: None,
        };
        enrichment.store.insert(1, entry(now - 3600));
        enrichment
            .store
            .insert(2, entry(now - STORE_MAX_AGE_SECS - 1));
        assert_eq!(enrichment.stale_store(&[1, 2, 3], now), vec![2, 3]);
    }

    #[test]
    fn cache_round_trips() {
        let dir =
            std::env::temp_dir().join(format!("vapor-enrichment-test-{}", std::process::id()));
        let mut enrichment = Enrichment::reset(Some(7), BTreeMap::new());
        enrichment.owned = vec![owned(620, 30, Some(5))];
        enrichment.save(&dir).unwrap();
        assert_eq!(Enrichment::load(&dir), enrichment);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
