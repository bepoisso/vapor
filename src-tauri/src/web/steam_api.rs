//! Official Steam Web API (`api.steampowered.com`), with the user's own key.
//! <https://partner.steamgames.com/doc/webapi>

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

use super::network_error;
use crate::error::Error;
use crate::model::AppId;

const BASE_URL: &str = "https://api.steampowered.com";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OwnedGame {
    pub app_id: AppId,
    pub name: String,
    pub playtime_minutes: u32,
    /// Unix seconds; `None` when never played.
    pub last_played: Option<u64>,
}

#[derive(Deserialize)]
struct OwnedGamesResponse {
    response: OwnedGamesBody,
}

#[derive(Deserialize)]
struct OwnedGamesBody {
    #[serde(default)]
    games: Vec<RawOwnedGame>,
}

#[derive(Deserialize)]
struct RawOwnedGame {
    appid: AppId,
    name: Option<String>,
    #[serde(default)]
    playtime_forever: u32,
    #[serde(default)]
    rtime_last_played: u64,
}

/// `IPlayerService/GetOwnedGames`: every game of the account, with names and playtime.
pub async fn owned_games(
    client: &Client,
    key: &str,
    steam_id64: u64,
) -> Result<Vec<OwnedGame>, Error> {
    let response = client
        .get(format!("{BASE_URL}/IPlayerService/GetOwnedGames/v1/"))
        .query(&[
            ("key", key),
            ("steamid", &steam_id64.to_string()),
            ("include_appinfo", "1"),
            ("include_played_free_games", "1"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(network_error)?;
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(Error::InvalidApiKey);
    }
    let body: OwnedGamesResponse = response
        .error_for_status()
        .map_err(network_error)?
        .json()
        .await
        .map_err(network_error)?;
    Ok(body
        .response
        .games
        .into_iter()
        .map(|game| OwnedGame {
            app_id: game.appid,
            name: game.name.unwrap_or_default(),
            playtime_minutes: game.playtime_forever,
            last_played: Some(game.rtime_last_played).filter(|&time| time > 0),
        })
        .collect())
}

/// GET `path` with `query`; maps 401/403 to `InvalidApiKey`.
async fn get_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    path: &str,
    query: &[(&str, &str)],
) -> Result<T, Error> {
    let response = client
        .get(format!("{BASE_URL}/{path}"))
        .query(query)
        .send()
        .await
        .map_err(network_error)?;
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(Error::InvalidApiKey);
    }
    response
        .error_for_status()
        .map_err(network_error)?
        .json()
        .await
        .map_err(network_error)
}

/// One achievement of a player.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerAchievement {
    pub api_name: String,
    pub achieved: bool,
    /// Unix seconds; `None` when locked (Steam sends 0).
    pub unlock_time: Option<u64>,
}

#[derive(Deserialize)]
struct AchievementsResponse {
    playerstats: PlayerStats,
}

#[derive(Deserialize)]
struct PlayerStats {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    achievements: Vec<RawAchievement>,
}

#[derive(Deserialize)]
struct RawAchievement {
    #[serde(default)]
    apiname: String,
    achieved: u8,
    #[serde(default)]
    unlocktime: u64,
}

/// `ISteamUserStats/GetPlayerAchievements`: every achievement of `app_id` with its state, or
/// `None` for games without achievements and players whose game details are private (Steam
/// answers both with an error body).
pub async fn player_achievements(
    client: &Client,
    key: &str,
    steam_id64: u64,
    app_id: AppId,
) -> Result<Option<Vec<PlayerAchievement>>, Error> {
    let response = client
        .get(format!(
            "{BASE_URL}/ISteamUserStats/GetPlayerAchievements/v1/"
        ))
        .query(&[
            ("key", key),
            ("steamid", &steam_id64.to_string()),
            ("appid", &app_id.to_string()),
        ])
        .send()
        .await
        .map_err(network_error)?;
    match response.status() {
        StatusCode::UNAUTHORIZED => return Err(Error::InvalidApiKey),
        // "Requested app has no stats" or a private profile: nothing to show.
        StatusCode::BAD_REQUEST | StatusCode::FORBIDDEN => return Ok(None),
        _ => {}
    }
    let body: AchievementsResponse = response
        .error_for_status()
        .map_err(network_error)?
        .json()
        .await
        .map_err(network_error)?;
    Ok(parse_player_achievements(body.playerstats))
}

fn parse_player_achievements(stats: PlayerStats) -> Option<Vec<PlayerAchievement>> {
    if !stats.success || stats.achievements.is_empty() {
        return None;
    }
    Some(
        stats
            .achievements
            .into_iter()
            .map(|raw| PlayerAchievement {
                api_name: raw.apiname,
                achieved: raw.achieved == 1,
                unlock_time: Some(raw.unlocktime).filter(|&time| time > 0),
            })
            .collect(),
    )
}

/// `(unlocked, total)` of a player's achievements list.
pub fn count_unlocked(achievements: &[PlayerAchievement]) -> Option<(u32, u32)> {
    let total = u32::try_from(achievements.len()).ok()?;
    let unlocked = u32::try_from(achievements.iter().filter(|a| a.achieved).count()).ok()?;
    Some((unlocked, total))
}

/// `(unlocked, total)`, or `None` for games without achievements.
pub async fn achievements(
    client: &Client,
    key: &str,
    steam_id64: u64,
    app_id: AppId,
) -> Result<Option<(u32, u32)>, Error> {
    Ok(player_achievements(client, key, steam_id64, app_id)
        .await?
        .as_deref()
        .and_then(count_unlocked))
}

/// Name, description and icons of an achievement (`GetSchemaForGame`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchemaAchievement {
    pub api_name: String,
    pub name: String,
    /// Steam leaves it out for hidden achievements.
    pub description: Option<String>,
    pub hidden: bool,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
}

#[derive(Deserialize)]
struct SchemaResponse {
    #[serde(default)]
    game: SchemaGame,
}

#[derive(Default, Deserialize)]
struct SchemaGame {
    #[serde(default, rename = "availableGameStats")]
    stats: SchemaStats,
}

#[derive(Default, Deserialize)]
struct SchemaStats {
    #[serde(default)]
    achievements: Vec<RawSchemaAchievement>,
}

#[derive(Deserialize)]
struct RawSchemaAchievement {
    name: String,
    #[serde(default, rename = "displayName")]
    display_name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    hidden: u8,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    icongray: Option<String>,
}

/// `ISteamUserStats/GetSchemaForGame` (English strings). Empty for games without achievements.
pub async fn achievement_schema(
    client: &Client,
    key: &str,
    app_id: AppId,
) -> Result<Vec<SchemaAchievement>, Error> {
    let body: SchemaResponse = get_json(
        client,
        "ISteamUserStats/GetSchemaForGame/v2/",
        &[
            ("key", key),
            ("appid", &app_id.to_string()),
            ("l", "english"),
        ],
    )
    .await?;
    Ok(parse_schema(body))
}

fn parse_schema(body: SchemaResponse) -> Vec<SchemaAchievement> {
    let non_empty = |value: Option<String>| value.filter(|text| !text.trim().is_empty());
    body.game
        .stats
        .achievements
        .into_iter()
        .map(|raw| SchemaAchievement {
            name: if raw.display_name.is_empty() {
                raw.name.clone()
            } else {
                raw.display_name
            },
            api_name: raw.name,
            description: non_empty(raw.description),
            hidden: raw.hidden == 1,
            icon: non_empty(raw.icon),
            icon_gray: non_empty(raw.icongray),
        })
        .collect()
}

#[derive(Deserialize)]
struct GlobalResponse {
    achievementpercentages: GlobalBody,
}

#[derive(Deserialize)]
struct GlobalBody {
    #[serde(default)]
    achievements: Vec<GlobalEntry>,
}

#[derive(Deserialize)]
struct GlobalEntry {
    name: String,
    /// A string ("70.7") in v2, a number in v1: accept both.
    percent: serde_json::Value,
}

/// `ISteamUserStats/GetGlobalAchievementPercentagesForApp` (no key): API name → % of players.
pub async fn global_achievement_percentages(
    client: &Client,
    app_id: AppId,
) -> Result<Vec<(String, f64)>, Error> {
    let response = client
        .get(format!(
            "{BASE_URL}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/"
        ))
        .query(&[("gameid", app_id.to_string())])
        .send()
        .await
        .map_err(network_error)?;
    // Games without achievements answer 403/404.
    if !response.status().is_success() {
        return Ok(Vec::new());
    }
    let body: GlobalResponse = response.json().await.map_err(network_error)?;
    Ok(parse_global(body))
}

fn parse_global(body: GlobalResponse) -> Vec<(String, f64)> {
    body.achievementpercentages
        .achievements
        .into_iter()
        .filter_map(|entry| {
            let percent = match &entry.percent {
                serde_json::Value::String(text) => text.parse().ok()?,
                value => value.as_f64()?,
            };
            Some((entry.name, percent))
        })
        .collect()
}

#[derive(Deserialize)]
struct FriendListResponse {
    friendslist: FriendList,
}

#[derive(Deserialize)]
struct FriendList {
    #[serde(default)]
    friends: Vec<RawFriend>,
}

#[derive(Deserialize)]
struct RawFriend {
    steamid: String,
}

/// `ISteamUser/GetFriendList`: SteamID64s of the account's friends, or `None` when the list is
/// not visible.
pub async fn friend_list(
    client: &Client,
    key: &str,
    steam_id64: u64,
) -> Result<Option<Vec<u64>>, Error> {
    let body: FriendListResponse = match get_json(
        client,
        "ISteamUser/GetFriendList/v1/",
        &[
            ("key", key),
            ("steamid", &steam_id64.to_string()),
            ("relationship", "friend"),
        ],
    )
    .await
    {
        Ok(body) => body,
        // A private friends list answers 401, like a bad key; the key was checked when saved.
        Err(Error::InvalidApiKey) => return Ok(None),
        Err(error) => return Err(error),
    };
    Ok(Some(
        body.friendslist
            .friends
            .iter()
            .filter_map(|friend| friend.steamid.parse().ok())
            .collect(),
    ))
}

/// Public profile of a player (`GetPlayerSummaries`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerSummary {
    pub steam_id64: u64,
    pub persona_name: String,
    pub avatar: Option<String>,
    /// The game the player is in right now.
    pub in_game: Option<AppId>,
}

#[derive(Deserialize)]
struct SummariesResponse {
    response: SummariesBody,
}

#[derive(Deserialize)]
struct SummariesBody {
    #[serde(default)]
    players: Vec<RawSummary>,
}

#[derive(Deserialize)]
struct RawSummary {
    steamid: String,
    #[serde(default)]
    personaname: String,
    #[serde(default)]
    avatarmedium: Option<String>,
    #[serde(default)]
    gameid: Option<String>,
}

/// Steam accepts up to 100 IDs per `GetPlayerSummaries` call.
const SUMMARIES_PER_CALL: usize = 100;

pub async fn player_summaries(
    client: &Client,
    key: &str,
    steam_ids: &[u64],
) -> Result<Vec<PlayerSummary>, Error> {
    let mut summaries = Vec::with_capacity(steam_ids.len());
    for chunk in steam_ids.chunks(SUMMARIES_PER_CALL) {
        let ids = chunk
            .iter()
            .map(u64::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let body: SummariesResponse = get_json(
            client,
            "ISteamUser/GetPlayerSummaries/v2/",
            &[("key", key), ("steamids", &ids)],
        )
        .await?;
        summaries.extend(parse_summaries(body));
    }
    Ok(summaries)
}

fn parse_summaries(body: SummariesResponse) -> impl Iterator<Item = PlayerSummary> {
    body.response.players.into_iter().filter_map(|raw| {
        Some(PlayerSummary {
            steam_id64: raw.steamid.parse().ok()?,
            persona_name: raw.personaname,
            avatar: raw.avatarmedium.filter(|url| !url.is_empty()),
            in_game: raw.gameid.and_then(|id| id.parse().ok()),
        })
    })
}

/// A game a friend played in the last two weeks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentGame {
    pub app_id: AppId,
    pub playtime_2weeks: u32,
}

#[derive(Deserialize)]
struct RecentResponse {
    response: RecentBody,
}

#[derive(Deserialize)]
struct RecentBody {
    #[serde(default)]
    games: Vec<RawRecent>,
}

#[derive(Deserialize)]
struct RawRecent {
    appid: AppId,
    #[serde(default)]
    playtime_2weeks: u32,
}

/// `IPlayerService/GetRecentlyPlayedGames`. Empty for players whose game details are private.
pub async fn recently_played(
    client: &Client,
    key: &str,
    steam_id64: u64,
) -> Result<Vec<RecentGame>, Error> {
    let body: RecentResponse = get_json(
        client,
        "IPlayerService/GetRecentlyPlayedGames/v1/",
        &[("key", key), ("steamid", &steam_id64.to_string())],
    )
    .await?;
    Ok(body
        .response
        .games
        .into_iter()
        .map(|raw| RecentGame {
            app_id: raw.appid,
            playtime_2weeks: raw.playtime_2weeks,
        })
        .collect())
}

/// App IDs a player owns (no names: a much smaller answer). Empty when their game details are
/// private.
pub async fn owned_app_ids(
    client: &Client,
    key: &str,
    steam_id64: u64,
) -> Result<Vec<AppId>, Error> {
    let body: OwnedGamesResponse = get_json(
        client,
        "IPlayerService/GetOwnedGames/v1/",
        &[
            ("key", key),
            ("steamid", &steam_id64.to_string()),
            ("include_played_free_games", "1"),
        ],
    )
    .await?;
    Ok(body.response.games.iter().map(|game| game.appid).collect())
}

/// A news post as Steam sends it (contents in BBCode or HTML).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawNews {
    pub gid: String,
    pub title: String,
    pub url: String,
    pub contents: String,
    /// Unix seconds.
    pub date: u64,
}

#[derive(Deserialize)]
struct NewsResponse {
    appnews: NewsBody,
}

#[derive(Deserialize)]
struct NewsBody {
    #[serde(default)]
    newsitems: Vec<RawNews>,
}

/// The developer's own announcements only: the full feed also carries press articles, some
/// about other games.
const NEWS_FEED: &str = "steam_community_announcements";

/// `ISteamNews/GetNewsForApp` (no key), newest first, full contents.
pub async fn app_news(client: &Client, app_id: AppId, count: u32) -> Result<Vec<RawNews>, Error> {
    let body: NewsResponse = get_json(
        client,
        "ISteamNews/GetNewsForApp/v2/",
        &[
            ("appid", &app_id.to_string()),
            ("count", &count.to_string()),
            ("feeds", NEWS_FEED),
            ("format", "json"),
        ],
    )
    .await?;
    Ok(body.appnews.newsitems)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_owned_games() {
        let body: OwnedGamesResponse = serde_json::from_str(
            r#"{"response":{"game_count":2,"games":[
                {"appid":504230,"name":"Celeste","playtime_forever":2806,"rtime_last_played":1767717569},
                {"appid":620,"name":"Portal 2","playtime_forever":0,"rtime_last_played":0}
            ]}}"#,
        )
        .unwrap();
        assert_eq!(body.response.games.len(), 2);
        assert_eq!(body.response.games[1].rtime_last_played, 0);
    }

    #[test]
    fn parses_an_empty_or_private_library() {
        let body: OwnedGamesResponse = serde_json::from_str(r#"{"response":{}}"#).unwrap();
        assert!(body.response.games.is_empty());
    }

    #[test]
    fn counts_unlocked_achievements() {
        let body: AchievementsResponse = serde_json::from_str(
            r#"{"playerstats":{"success":true,"achievements":[{"achieved":1},{"achieved":0},{"achieved":1}]}}"#,
        )
        .unwrap();
        let achievements = parse_player_achievements(body.playerstats).unwrap();
        assert_eq!(count_unlocked(&achievements), Some((2, 3)));
    }

    #[test]
    fn games_without_stats_have_no_achievements() {
        let body: AchievementsResponse = serde_json::from_str(
            r#"{"playerstats":{"error":"Requested app has no stats","success":false}}"#,
        )
        .unwrap();
        assert_eq!(parse_player_achievements(body.playerstats), None);
    }

    #[test]
    fn reads_unlock_times() {
        let body: AchievementsResponse = serde_json::from_str(
            r#"{"playerstats":{"success":true,"achievements":[
                {"apiname":"CH1","achieved":1,"unlocktime":1517000000},
                {"apiname":"CH2","achieved":0,"unlocktime":0}
            ]}}"#,
        )
        .unwrap();
        let achievements = parse_player_achievements(body.playerstats).unwrap();
        assert_eq!(achievements[0].unlock_time, Some(1_517_000_000));
        assert_eq!(achievements[1].unlock_time, None);
        assert!(!achievements[1].achieved);
    }

    #[test]
    fn parses_the_achievement_schema() {
        let body: SchemaResponse = serde_json::from_str(
            r#"{"game":{"gameName":"Celeste","availableGameStats":{"achievements":[
                {"name":"CH1","defaultvalue":0,"displayName":"Forsaken City","hidden":0,"description":"Complete Chapter 1","icon":"https://cdn.akamai.steamstatic.com/a.jpg","icongray":"https://cdn.akamai.steamstatic.com/b.jpg"},
                {"name":"SECRET","displayName":"","hidden":1,"description":"","icon":"","icongray":""}
            ]}}}"#,
        )
        .unwrap();
        let schema = parse_schema(body);
        assert_eq!(schema[0].name, "Forsaken City");
        assert_eq!(schema[0].description.as_deref(), Some("Complete Chapter 1"));
        assert!(schema[1].hidden);
        assert_eq!(schema[1].name, "SECRET");
        assert_eq!(schema[1].description, None);
        assert_eq!(schema[1].icon, None);
    }

    #[test]
    fn games_without_achievements_have_an_empty_schema() {
        let body: SchemaResponse = serde_json::from_str(r#"{"game":{}}"#).unwrap();
        assert!(parse_schema(body).is_empty());
    }

    #[test]
    fn reads_global_percentages_as_strings_or_numbers() {
        let body: GlobalResponse = serde_json::from_str(
            r#"{"achievementpercentages":{"achievements":[{"name":"CH1","percent":"70.7"},{"name":"CH2","percent":61.5}]}}"#,
        )
        .unwrap();
        assert_eq!(
            parse_global(body),
            [("CH1".to_owned(), 70.7), ("CH2".to_owned(), 61.5)]
        );
    }

    #[test]
    fn parses_player_summaries() {
        let body: SummariesResponse = serde_json::from_str(
            r#"{"response":{"players":[
                {"steamid":"76561197960287930","personaname":"Rabscuttle","avatarmedium":"https://avatars.steamstatic.com/x_medium.jpg","gameid":"504230"},
                {"steamid":"76561197960287931","personaname":"Quiet"}
            ]}}"#,
        )
        .unwrap();
        let players: Vec<_> = parse_summaries(body).collect();
        assert_eq!(players[0].steam_id64, 76_561_197_960_287_930);
        assert_eq!(players[0].in_game, Some(504230));
        assert_eq!(players[1].avatar, None);
        assert_eq!(players[1].in_game, None);
    }

    #[test]
    fn parses_news() {
        let body: NewsResponse = serde_json::from_str(
            r#"{"appnews":{"appid":504230,"newsitems":[{"gid":"1784506358986604","title":"New Merch!","url":"https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1784506358986604","is_external_url":true,"author":"","contents":"Hey there climbers!","feedlabel":"Community Announcements","date":1732732267,"feedname":"steam_community_announcements","feed_type":1,"appid":504230}],"count":2}}"#,
        )
        .unwrap();
        assert_eq!(body.appnews.newsitems[0].title, "New Merch!");
        assert_eq!(body.appnews.newsitems[0].date, 1_732_732_267);
    }
}
