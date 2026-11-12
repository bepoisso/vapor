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
    achieved: u8,
}

/// `ISteamUserStats/GetPlayerAchievements`: `(unlocked, total)`, or `None` for games without
/// achievements (Steam answers those with an error body).
pub async fn achievements(
    client: &Client,
    key: &str,
    steam_id64: u64,
    app_id: AppId,
) -> Result<Option<(u32, u32)>, Error> {
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
    Ok(parse_achievements(body.playerstats))
}

fn parse_achievements(stats: PlayerStats) -> Option<(u32, u32)> {
    if !stats.success || stats.achievements.is_empty() {
        return None;
    }
    let total = u32::try_from(stats.achievements.len()).ok()?;
    let unlocked = u32::try_from(
        stats
            .achievements
            .iter()
            .filter(|a| a.achieved == 1)
            .count(),
    )
    .ok()?;
    Some((unlocked, total))
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
        assert_eq!(parse_achievements(body.playerstats), Some((2, 3)));
    }

    #[test]
    fn games_without_stats_have_no_achievements() {
        let body: AchievementsResponse = serde_json::from_str(
            r#"{"playerstats":{"error":"Requested app has no stats","success":false}}"#,
        )
        .unwrap();
        assert_eq!(parse_achievements(body.playerstats), None);
    }
}
