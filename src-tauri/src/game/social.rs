//! Friends on the game page: who plays or owns the game, and their recent achievements in it
//! (the "Activity" block; Steam has no public activity-feed API). Needs the user's Web API key
//! and a visible friends list.
//!
//! Friend profiles (names, avatars, in-game status) are refreshed when a page opens if older
//! than two minutes. What each friend played and owns takes two calls per friend, so it is
//! fetched in the background, spaced out, and kept for 12 hours; friends whose game details are
//! private simply show nothing. Activity is fetched per game, for a few friends who play it,
//! and kept for 3 hours. The UI is told through `SocialUpdated`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError, RwLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::achievements::{AchievementsService, Cached as CachedAchievements};
use super::{
    ActivityAchievement, ActivityItem, ActivityKind, FriendOnGame, FriendStatus, GameSocial,
};
use crate::error::Error;
use crate::library::service::LibraryService;
use crate::library::snapshot::iso8601_utc;
use crate::model::AppId;
use crate::remote_images::{RemoteImages, RemoteSize};
use crate::settings;
use crate::web::HttpClient;
use crate::web::steam_api::{self, RecentGame};

/// Emitted when friends' data changed in the background; the game page asks again.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SocialUpdated;

const FILE: &str = "friends-cache.json";
const VERSION: u32 = 1;
const SUMMARIES_MAX_AGE_SECS: u64 = 120;
const GAMES_MAX_AGE_SECS: u64 = 12 * 3600;
const ACTIVITY_MAX_AGE_SECS: u64 = 3 * 3600;
/// After a failed activity fetch, try again after this long.
const ACTIVITY_RETRY_SECS: u64 = 600;
/// Friends whose achievements are fetched for the Activity block.
const ACTIVITY_FRIENDS: usize = 8;
/// Unlocks older than this are not "activity".
const ACTIVITY_WINDOW_SECS: u64 = 180 * 24 * 3600;
const ACTIVITY_MAX_ITEMS: usize = 10;
const ACTIVITY_TILES: usize = 2;
const SPACING: Duration = Duration::from_millis(150);
const BATCH: usize = 10;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
struct Cache {
    version: u32,
    account: Option<u64>,
    /// Unix seconds of the last friends list and profiles refresh.
    summaries_at: u64,
    /// The friends list is not visible.
    unavailable: bool,
    friends: Vec<Friend>,
    activity: BTreeMap<AppId, AppActivity>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Friend {
    steam_id64: u64,
    persona_name: String,
    avatar: Option<String>,
    in_game: Option<AppId>,
    /// Unix seconds of the last games fetch.
    games_at: Option<u64>,
    recent: Vec<RecentGame>,
    /// Sorted.
    owned: Vec<AppId>,
}

impl Friend {
    fn status(&self, app_id: AppId) -> Option<(FriendStatus, Option<u32>)> {
        let recent = self
            .recent
            .iter()
            .find(|game| game.app_id == app_id)
            .map(|game| game.playtime_2weeks)
            .filter(|&minutes| minutes > 0);
        if self.in_game == Some(app_id) {
            Some((FriendStatus::InGame, recent))
        } else if recent.is_some() {
            Some((FriendStatus::PlayedRecently, recent))
        } else if self.owned.binary_search(&app_id).is_ok() {
            Some((FriendStatus::Owns, None))
        } else {
            None
        }
    }

    fn games_stale(&self, now: u64) -> bool {
        self.games_at
            .is_none_or(|at| now.saturating_sub(at) > GAMES_MAX_AGE_SECS)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct AppActivity {
    fetched_at: u64,
    unlocks: Vec<Unlock>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Unlock {
    steam_id64: u64,
    api_name: String,
    time: u64,
}

pub struct SocialService {
    dir: PathBuf,
    /// Loaded on first use, not at startup.
    cache: OnceLock<RwLock<Arc<Cache>>>,
    games_syncing: AtomicBool,
    activity_syncing: Mutex<BTreeSet<AppId>>,
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

impl SocialService {
    pub fn new(cache_dir: &Path) -> Self {
        Self {
            dir: cache_dir.to_owned(),
            cache: OnceLock::new(),
            games_syncing: AtomicBool::new(false),
            activity_syncing: Mutex::new(BTreeSet::new()),
        }
    }

    fn lock(&self) -> &RwLock<Arc<Cache>> {
        self.cache.get_or_init(|| {
            let cache = std::fs::read(self.dir.join(FILE))
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Cache>(&bytes).ok())
                .filter(|cache| cache.version == VERSION)
                .unwrap_or_default();
            RwLock::new(Arc::new(cache))
        })
    }

    fn current(&self) -> Arc<Cache> {
        self.lock()
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn update(&self, change: impl FnOnce(&mut Cache)) {
        let mut guard = self.lock().write().unwrap_or_else(PoisonError::into_inner);
        let mut next = (**guard).clone();
        change(&mut next);
        *guard = Arc::new(next);
    }

    /// A failed write only costs a refetch next launch.
    fn save(&self) {
        let cache = self.current();
        let _ = std::fs::create_dir_all(&self.dir).and_then(|()| {
            let partial = self.dir.join(format!("{FILE}.tmp"));
            std::fs::write(&partial, serde_json::to_vec(&*cache).unwrap_or_default())?;
            std::fs::rename(&partial, self.dir.join(FILE))
        });
    }

    /// Forgets everything (key removed or account switched).
    pub fn reset(&self) {
        self.update(|cache| *cache = Cache::default());
        let _ = std::fs::remove_file(self.dir.join(FILE));
    }

    /// Friends and activity for `app_id`, or `None` without a key or a visible friends list.
    pub async fn get(app: &AppHandle, app_id: AppId) -> Result<Option<GameSocial>, Error> {
        let service = app.state::<SocialService>();
        let (Some(key), Some(account)) = (
            settings::api_key(),
            app.state::<LibraryService>().active_account(),
        ) else {
            return Ok(None);
        };
        let client = app.state::<HttpClient>().0.clone();
        let now = now_unix();

        let cache = service.current();
        let same_account = cache.account == Some(account);
        if !same_account || now.saturating_sub(cache.summaries_at) > SUMMARIES_MAX_AGE_SECS {
            let refreshed = service.refresh_profiles(&client, &key, account, now).await;
            // Stale profiles are better than nothing; another account's are not.
            if let Err(error) = refreshed
                && !same_account
            {
                return Err(error);
            }
        }

        let cache = service.current();
        if cache.unavailable {
            return Ok(None);
        }
        let games_stale = cache.friends.iter().any(|friend| friend.games_stale(now));
        let activity_stale = cache
            .activity
            .get(&app_id)
            .is_none_or(|activity| now.saturating_sub(activity.fetched_at) > ACTIVITY_MAX_AGE_SECS);
        if games_stale || activity_stale {
            Self::spawn_sync(
                app.clone(),
                key,
                account,
                app_id,
                games_stale,
                activity_stale,
            );
        }
        let loading = service.games_syncing.load(Ordering::Acquire)
            || service
                .activity_syncing
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .contains(&app_id);
        let achievements = app.state::<AchievementsService>().cached(app_id);
        Ok(Some(view(
            &cache,
            app_id,
            achievements.as_deref(),
            &app.state::<RemoteImages>(),
            loading,
            now,
        )))
    }

    /// Friends list and profiles; keeps what is known of each friend's games.
    async fn refresh_profiles(
        &self,
        client: &reqwest::Client,
        key: &str,
        account: u64,
        now: u64,
    ) -> Result<(), Error> {
        let Some(ids) = steam_api::friend_list(client, key, account).await? else {
            self.update(|cache| {
                *cache = Cache {
                    version: VERSION,
                    account: Some(account),
                    summaries_at: now,
                    unavailable: true,
                    ..Cache::default()
                };
            });
            self.save();
            return Ok(());
        };
        let summaries = steam_api::player_summaries(client, key, &ids).await?;
        self.update(|cache| {
            if cache.account != Some(account) {
                *cache = Cache::default();
            }
            let mut known: BTreeMap<u64, Friend> = std::mem::take(&mut cache.friends)
                .into_iter()
                .map(|friend| (friend.steam_id64, friend))
                .collect();
            cache.friends = summaries
                .into_iter()
                .map(|summary| {
                    let previous = known.remove(&summary.steam_id64);
                    Friend {
                        steam_id64: summary.steam_id64,
                        persona_name: summary.persona_name,
                        avatar: summary.avatar,
                        in_game: summary.in_game,
                        games_at: previous.as_ref().and_then(|friend| friend.games_at),
                        recent: previous
                            .as_ref()
                            .map(|friend| friend.recent.clone())
                            .unwrap_or_default(),
                        owned: previous.map(|friend| friend.owned).unwrap_or_default(),
                    }
                })
                .collect();
            cache.version = VERSION;
            cache.account = Some(account);
            cache.summaries_at = now;
            cache.unavailable = false;
        });
        self.save();
        Ok(())
    }

    fn spawn_sync(
        app: AppHandle,
        key: String,
        account: u64,
        app_id: AppId,
        games: bool,
        activity: bool,
    ) {
        let service = app.state::<SocialService>();
        let run_games = games && !service.games_syncing.swap(true, Ordering::AcqRel);
        let run_activity = activity
            && service
                .activity_syncing
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .insert(app_id);
        if !run_games && !run_activity {
            return;
        }
        tauri::async_runtime::spawn(async move {
            let service = app.state::<SocialService>();
            let client = app.state::<HttpClient>().0.clone();
            if run_games {
                let _ = service.sync_games(&app, &client, &key).await;
                service.games_syncing.store(false, Ordering::Release);
                let _ = SocialUpdated.emit(&app);
            }
            if run_activity {
                // Activity picks friends from their games: let a running games sync finish.
                while service.games_syncing.load(Ordering::Acquire) {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                service.sync_activity(&client, &key, account, app_id).await;
                service
                    .activity_syncing
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .remove(&app_id);
                let _ = SocialUpdated.emit(&app);
            }
        });
    }

    async fn sync_games(
        &self,
        app: &AppHandle,
        client: &reqwest::Client,
        key: &str,
    ) -> Result<(), Error> {
        let now = now_unix();
        let stale: Vec<u64> = self
            .current()
            .friends
            .iter()
            .filter(|friend| friend.games_stale(now))
            .map(|friend| friend.steam_id64)
            .collect();
        for (index, steam_id64) in stale.into_iter().enumerate() {
            let recent = steam_api::recently_played(client, key, steam_id64).await?;
            tokio::time::sleep(SPACING).await;
            let mut owned = steam_api::owned_app_ids(client, key, steam_id64).await?;
            tokio::time::sleep(SPACING).await;
            owned.sort_unstable();
            owned.dedup();
            self.update(|cache| {
                if let Some(friend) = cache
                    .friends
                    .iter_mut()
                    .find(|friend| friend.steam_id64 == steam_id64)
                {
                    friend.recent = recent;
                    friend.owned = owned;
                    friend.games_at = Some(now_unix());
                }
            });
            if (index + 1) % BATCH == 0 {
                self.save();
                let _ = SocialUpdated.emit(app);
            }
        }
        self.save();
        Ok(())
    }

    async fn sync_activity(
        &self,
        client: &reqwest::Client,
        key: &str,
        account: u64,
        app_id: AppId,
    ) {
        let now = now_unix();
        let cache = self.current();
        if cache.account != Some(account) {
            return;
        }
        let mut candidates: Vec<(FriendStatus, u32, u64)> = cache
            .friends
            .iter()
            .filter_map(|friend| {
                let (status, recent) = friend.status(app_id)?;
                Some((status, recent.unwrap_or(0), friend.steam_id64))
            })
            .collect();
        candidates.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)));

        let mut unlocks = Vec::new();
        let mut failed = false;
        for (_, _, steam_id64) in candidates.into_iter().take(ACTIVITY_FRIENDS) {
            match steam_api::player_achievements(client, key, steam_id64, app_id).await {
                Ok(achievements) => unlocks.extend(
                    achievements
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|achievement| achievement.achieved)
                        .filter_map(|achievement| {
                            let time = achievement.unlock_time?;
                            (now.saturating_sub(time) < ACTIVITY_WINDOW_SECS).then_some(Unlock {
                                steam_id64,
                                api_name: achievement.api_name,
                                time,
                            })
                        }),
                ),
                Err(_) => {
                    failed = true;
                    break;
                }
            }
            tokio::time::sleep(SPACING).await;
        }
        self.update(|cache| {
            let previous = cache.activity.remove(&app_id).unwrap_or_default();
            let activity = if failed {
                AppActivity {
                    fetched_at: now.saturating_sub(ACTIVITY_MAX_AGE_SECS - ACTIVITY_RETRY_SECS),
                    unlocks: if unlocks.is_empty() {
                        previous.unlocks
                    } else {
                        unlocks
                    },
                }
            } else {
                AppActivity {
                    fetched_at: now,
                    unlocks,
                }
            };
            cache.activity.insert(app_id, activity);
        });
        self.save();
    }
}

fn view(
    cache: &Cache,
    app_id: AppId,
    achievements: Option<&CachedAchievements>,
    remote: &RemoteImages,
    loading: bool,
    now: u64,
) -> GameSocial {
    let avatar = |url: &Option<String>| {
        url.as_deref()
            .and_then(|url| remote.register(url, RemoteSize::Original))
    };
    let mut friends: Vec<(FriendStatus, Option<u32>, &Friend)> = cache
        .friends
        .iter()
        .filter_map(|friend| {
            let (status, recent) = friend.status(app_id)?;
            Some((status, recent, friend))
        })
        .collect();
    friends.sort_by(|a, b| {
        a.0.cmp(&b.0).then(b.1.cmp(&a.1)).then_with(|| {
            a.2.persona_name
                .to_lowercase()
                .cmp(&b.2.persona_name.to_lowercase())
        })
    });
    let friends = friends
        .into_iter()
        .map(|(status, recent, friend)| FriendOnGame {
            steam_id: friend.steam_id64.to_string(),
            persona_name: friend.persona_name.clone(),
            avatar: avatar(&friend.avatar),
            recent_playtime_minutes: recent,
            status,
        })
        .collect();

    let activity = cache
        .activity
        .get(&app_id)
        .map(|activity| activity_items(cache, activity, achievements, remote, now))
        .unwrap_or_default();

    GameSocial {
        friends,
        activity,
        loading,
    }
}

/// Unlocks grouped per friend and day, newest first.
fn activity_items(
    cache: &Cache,
    activity: &AppActivity,
    achievements: Option<&CachedAchievements>,
    remote: &RemoteImages,
    now: u64,
) -> Vec<ActivityItem> {
    let mut groups: BTreeMap<(u64, u64), Vec<&Unlock>> = BTreeMap::new();
    for unlock in &activity.unlocks {
        if now.saturating_sub(unlock.time) < ACTIVITY_WINDOW_SECS {
            groups
                .entry((unlock.steam_id64, unlock.time / 86_400))
                .or_default()
                .push(unlock);
        }
    }
    let unlocked_by_me = |api_name: &str| {
        achievements.is_some_and(|cached| {
            cached
                .player
                .iter()
                .any(|mine| mine.api_name == api_name && mine.achieved)
        })
    };
    let mut items: Vec<(u64, ActivityItem)> = groups
        .into_values()
        .filter_map(|mut unlocks| {
            unlocks.sort_by_key(|unlock| std::cmp::Reverse(unlock.time));
            let latest = unlocks.first()?;
            let friend = cache
                .friends
                .iter()
                .find(|friend| friend.steam_id64 == latest.steam_id64)?;
            let tiles = unlocks
                .iter()
                .take(ACTIVITY_TILES)
                .map(|unlock| {
                    let schema = achievements.and_then(|cached| {
                        cached
                            .schema
                            .iter()
                            .find(|schema| schema.api_name == unlock.api_name)
                    });
                    // Spoiler-free: hidden achievements the user hasn't unlocked stay hidden.
                    let hidden = schema.is_some_and(|schema| schema.hidden)
                        && !unlocked_by_me(&unlock.api_name);
                    ActivityAchievement {
                        name: schema.filter(|_| !hidden).map(|schema| schema.name.clone()),
                        icon: schema
                            .filter(|_| !hidden)
                            .and_then(|schema| schema.icon.as_deref())
                            .and_then(|url| remote.register(url, RemoteSize::Original)),
                        hidden,
                    }
                })
                .collect();
            Some((
                latest.time,
                ActivityItem {
                    date: iso8601_utc(latest.time),
                    kind: ActivityKind::FriendAchievements,
                    friend: friend.persona_name.clone(),
                    friend_avatar: friend
                        .avatar
                        .as_deref()
                        .and_then(|url| remote.register(url, RemoteSize::Original)),
                    count: u32::try_from(unlocks.len()).unwrap_or(u32::MAX),
                    items: tiles,
                },
            ))
        })
        .collect();
    items.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    items
        .into_iter()
        .take(ACTIVITY_MAX_ITEMS)
        .map(|(_, item)| item)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn friend(
        id: u64,
        name: &str,
        in_game: Option<AppId>,
        recent: &[(AppId, u32)],
        owned: &[AppId],
    ) -> Friend {
        Friend {
            steam_id64: id,
            persona_name: name.into(),
            avatar: None,
            in_game,
            games_at: Some(0),
            recent: recent
                .iter()
                .map(|&(app_id, playtime_2weeks)| RecentGame {
                    app_id,
                    playtime_2weeks,
                })
                .collect(),
            owned: owned.to_vec(),
        }
    }

    #[test]
    fn friends_are_ordered_by_status_then_recent_playtime() {
        let cache = Cache {
            friends: vec![
                friend(1, "owner", None, &[], &[504230]),
                friend(2, "notoverflow", None, &[(504230, 456)], &[504230]),
                friend(3, "playing", Some(504230), &[], &[504230]),
                friend(4, "busy", None, &[(504230, 900)], &[]),
                friend(5, "stranger", None, &[(620, 60)], &[620]),
            ],
            ..Cache::default()
        };
        let social = view(
            &cache,
            504230,
            None,
            &RemoteImages::new(Path::new("c")),
            false,
            0,
        );
        let names: Vec<_> = social
            .friends
            .iter()
            .map(|f| f.persona_name.as_str())
            .collect();
        assert_eq!(names, ["playing", "busy", "notoverflow", "owner"]);
        assert_eq!(social.friends[2].status, FriendStatus::PlayedRecently);
        assert_eq!(social.friends[2].recent_playtime_minutes, Some(456));
        assert_eq!(social.friends[3].recent_playtime_minutes, None);
    }

    #[test]
    fn activity_groups_unlocks_per_friend_and_day() {
        let day = 86_400;
        let now = 1000 * day;
        let unlock = |id, api: &str, time| Unlock {
            steam_id64: id,
            api_name: api.into(),
            time,
        };
        let cache = Cache {
            friends: vec![friend(2, "notoverflow", None, &[(504230, 456)], &[])],
            activity: BTreeMap::from([(
                504230,
                AppActivity {
                    fetched_at: now,
                    unlocks: vec![
                        unlock(2, "HEART1", now - 3 * day + 100),
                        unlock(2, "HEART2", now - 3 * day + 200),
                        unlock(2, "CH1", now - 10 * day),
                        unlock(2, "OLD", now - 400 * day),
                        unlock(9, "UNKNOWN_FRIEND", now - day),
                    ],
                },
            )]),
            ..Cache::default()
        };
        let social = view(
            &cache,
            504230,
            None,
            &RemoteImages::new(Path::new("c")),
            false,
            now,
        );
        assert_eq!(social.activity.len(), 2);
        assert_eq!(social.activity[0].count, 2);
        assert_eq!(social.activity[0].items.len(), 2);
        assert_eq!(social.activity[1].count, 1);
        // Without the schema, names are unknown.
        assert_eq!(social.activity[0].items[0].name, None);
    }
}
