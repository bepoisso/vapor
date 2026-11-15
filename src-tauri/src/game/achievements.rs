//! The full achievement list of a game: the player's state (`GetPlayerAchievements`), names and
//! icons (`GetSchemaForGame`) and rarity (`GetGlobalAchievementPercentagesForApp`). Cached per
//! app on disk; refetched after the game was played again, or after a day (rarity drifts).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock};

use serde::{Deserialize, Serialize};

use super::{Achievement, AchievementList};
use crate::error::Error;
use crate::library::snapshot::iso8601_utc;
use crate::model::AppId;
use crate::remote_images::{RemoteImages, RemoteSize};
use crate::web::steam_api::{self, PlayerAchievement, SchemaAchievement};

const MAX_AGE_SECS: u64 = 24 * 3600;
/// Bump when the shape changes; older files are then refetched.
const VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cached {
    version: u32,
    account: u64,
    /// Unix seconds.
    fetched_at: u64,
    /// The game's `last_played` when fetched.
    fetched_for: Option<u64>,
    /// Empty when the game has no achievements (or the player's details are private).
    pub schema: Vec<SchemaAchievement>,
    pub player: Vec<PlayerAchievement>,
    pub global: Vec<(String, f64)>,
}

pub struct AchievementsService {
    dir: PathBuf,
    memory: RwLock<HashMap<AppId, Arc<Cached>>>,
}

impl AchievementsService {
    pub fn new(cache_dir: &Path) -> Self {
        Self {
            dir: cache_dir.join("achievements"),
            memory: RwLock::new(HashMap::new()),
        }
    }

    fn file(&self, app_id: AppId) -> PathBuf {
        self.dir.join(format!("{app_id}.json"))
    }

    /// Cached data, from memory or disk.
    pub fn cached(&self, app_id: AppId) -> Option<Arc<Cached>> {
        if let Some(found) = self
            .memory
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&app_id)
        {
            return Some(found.clone());
        }
        let cached: Cached = std::fs::read(self.file(app_id))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .filter(|cached: &Cached| cached.version == VERSION)?;
        let cached = Arc::new(cached);
        self.remember(app_id, cached.clone());
        Some(cached)
    }

    fn remember(&self, app_id: AppId, cached: Arc<Cached>) {
        self.memory
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(app_id, cached);
    }

    fn store(&self, app_id: AppId, cached: Cached) -> Arc<Cached> {
        // A failed write only costs a refetch.
        let _ = std::fs::create_dir_all(&self.dir).and_then(|()| {
            let partial = self.file(app_id).with_extension("json.tmp");
            std::fs::write(&partial, serde_json::to_vec(&cached).unwrap_or_default())?;
            std::fs::rename(&partial, self.file(app_id))
        });
        let cached = Arc::new(cached);
        self.remember(app_id, cached.clone());
        cached
    }

    /// The achievements of `app_id` for `account`, fetched when the cache is stale. A failed
    /// fetch serves the stale cache when there is one.
    pub async fn get(
        &self,
        client: &reqwest::Client,
        key: &str,
        account: u64,
        app_id: AppId,
        last_played: Option<u64>,
        now: u64,
    ) -> Result<Arc<Cached>, Error> {
        let cached = self
            .cached(app_id)
            .filter(|cached| cached.account == account);
        if let Some(cached) = &cached
            && cached.fetched_for == last_played
            && now.saturating_sub(cached.fetched_at) < MAX_AGE_SECS
        {
            return Ok(cached.clone());
        }
        match fetch(client, key, account, app_id).await {
            Ok((schema, player, global)) => Ok(self.store(
                app_id,
                Cached {
                    version: VERSION,
                    account,
                    fetched_at: now,
                    fetched_for: last_played,
                    schema,
                    player,
                    global,
                },
            )),
            Err(error) => cached.ok_or(error),
        }
    }
}

async fn fetch(
    client: &reqwest::Client,
    key: &str,
    account: u64,
    app_id: AppId,
) -> Result<
    (
        Vec<SchemaAchievement>,
        Vec<PlayerAchievement>,
        Vec<(String, f64)>,
    ),
    Error,
> {
    let Some(player) = steam_api::player_achievements(client, key, account, app_id).await? else {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    };
    let schema = steam_api::achievement_schema(client, key, app_id).await?;
    // Rarity only picks "Next up": the list still shows without it.
    let global = steam_api::global_achievement_percentages(client, app_id)
        .await
        .unwrap_or_default();
    Ok((schema, player, global))
}

/// The list the page shows, or `None` for games without achievements.
pub fn to_list(cached: &Cached, remote: &RemoteImages) -> Option<AchievementList> {
    if cached.player.is_empty() {
        return None;
    }
    let state: HashMap<&str, &PlayerAchievement> = cached
        .player
        .iter()
        .map(|achievement| (achievement.api_name.as_str(), achievement))
        .collect();
    let global: HashMap<&str, f64> = cached
        .global
        .iter()
        .map(|(name, percent)| (name.as_str(), *percent))
        .collect();
    let icon = |url: &Option<String>| {
        url.as_deref()
            .and_then(|url| remote.register(url, RemoteSize::Original))
    };
    let items: Vec<Achievement> = if cached.schema.is_empty() {
        // No schema (rare): API names only.
        cached
            .player
            .iter()
            .map(|player| Achievement {
                api_name: player.api_name.clone(),
                name: player.api_name.clone(),
                description: None,
                icon: None,
                icon_gray: None,
                hidden: false,
                unlocked: player.achieved,
                unlocked_at: player.unlock_time.map(iso8601_utc),
                global_percent: global.get(player.api_name.as_str()).copied(),
            })
            .collect()
    } else {
        cached
            .schema
            .iter()
            .map(|schema| {
                let player = state.get(schema.api_name.as_str());
                Achievement {
                    api_name: schema.api_name.clone(),
                    name: schema.name.clone(),
                    description: schema.description.clone(),
                    icon: icon(&schema.icon),
                    icon_gray: icon(&schema.icon_gray),
                    hidden: schema.hidden,
                    unlocked: player.is_some_and(|player| player.achieved),
                    unlocked_at: player
                        .and_then(|player| player.unlock_time)
                        .map(iso8601_utc),
                    global_percent: global.get(schema.api_name.as_str()).copied(),
                }
            })
            .collect()
    };
    let total = u32::try_from(items.len()).ok()?;
    let unlocked = u32::try_from(items.iter().filter(|item| item.unlocked).count()).ok()?;
    Some(AchievementList {
        unlocked,
        total,
        next: next_up(&items).cloned(),
        items,
    })
}

/// "Next up": the locked achievement most players unlocked (the most attainable one). Hidden
/// ones are skipped unless every remaining achievement is hidden. Ties keep the game's order.
pub fn next_up(items: &[Achievement]) -> Option<&Achievement> {
    let locked: Vec<&Achievement> = items.iter().filter(|item| !item.unlocked).collect();
    let visible: Vec<&Achievement> = locked.iter().copied().filter(|item| !item.hidden).collect();
    let pool = if visible.is_empty() { locked } else { visible };
    pool.into_iter().reduce(|best, item| {
        if item.global_percent.unwrap_or(-1.0) > best.global_percent.unwrap_or(-1.0) {
            item
        } else {
            best
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(api_name: &str, unlocked: bool, hidden: bool, percent: Option<f64>) -> Achievement {
        Achievement {
            api_name: api_name.into(),
            name: api_name.into(),
            description: None,
            icon: None,
            icon_gray: None,
            hidden,
            unlocked,
            unlocked_at: None,
            global_percent: percent,
        }
    }

    #[test]
    fn next_up_is_the_most_attainable_locked_achievement() {
        let items = [
            item("CH1", true, false, Some(70.7)),
            item("CH8", false, false, Some(20.0)),
            item("HEART", false, false, Some(28.4)),
            item("SECRET", false, true, Some(60.0)),
        ];
        assert_eq!(next_up(&items).map(|a| a.api_name.as_str()), Some("HEART"));
    }

    #[test]
    fn hidden_achievements_are_next_only_when_nothing_else_is_left() {
        let items = [
            item("CH1", true, false, Some(70.7)),
            item("SECRET1", false, true, Some(10.0)),
            item("SECRET2", false, true, Some(12.0)),
        ];
        assert_eq!(
            next_up(&items).map(|a| a.api_name.as_str()),
            Some("SECRET2")
        );
        let done = [item("CH1", true, false, Some(70.7))];
        assert_eq!(next_up(&done), None);
    }

    #[test]
    fn ties_and_unknown_rarity_keep_the_game_order() {
        let items = [item("A", false, false, None), item("B", false, false, None)];
        assert_eq!(next_up(&items).map(|a| a.api_name.as_str()), Some("A"));
    }

    #[test]
    fn merges_schema_state_and_rarity() {
        let cached = Cached {
            version: VERSION,
            account: 1,
            fetched_at: 0,
            fetched_for: None,
            schema: vec![
                SchemaAchievement {
                    api_name: "CH1".into(),
                    name: "Forsaken City".into(),
                    description: Some("Complete Chapter 1".into()),
                    hidden: false,
                    icon: Some("https://cdn.akamai.steamstatic.com/a.jpg".into()),
                    icon_gray: Some("https://evil.example.com/b.jpg".into()),
                },
                SchemaAchievement {
                    api_name: "CH2".into(),
                    name: "Old Site".into(),
                    description: None,
                    hidden: false,
                    icon: None,
                    icon_gray: None,
                },
            ],
            player: vec![
                PlayerAchievement {
                    api_name: "CH1".into(),
                    achieved: true,
                    unlock_time: Some(1_767_717_569),
                },
                PlayerAchievement {
                    api_name: "CH2".into(),
                    achieved: false,
                    unlock_time: None,
                },
            ],
            global: vec![("CH1".into(), 70.7), ("CH2".into(), 61.7)],
        };
        let list = to_list(&cached, &RemoteImages::new(Path::new("cache"))).unwrap();
        assert_eq!((list.unlocked, list.total), (1, 2));
        assert_eq!(
            list.items[0].unlocked_at.as_deref(),
            Some("2026-01-06T16:39:29Z")
        );
        assert!(
            list.items[0]
                .icon
                .as_deref()
                .is_some_and(|url| url.contains("/remote/"))
        );
        // Not a Steam host: dropped.
        assert_eq!(list.items[0].icon_gray, None);
        assert_eq!(list.next.map(|next| next.api_name), Some("CH2".into()));
    }

    #[test]
    fn games_without_achievements_have_no_list() {
        let cached = Cached {
            version: VERSION,
            account: 1,
            fetched_at: 0,
            fetched_for: None,
            schema: Vec::new(),
            player: Vec::new(),
            global: Vec::new(),
        };
        assert_eq!(
            to_list(&cached, &RemoteImages::new(Path::new("cache"))),
            None
        );
    }
}
