//! The game page: details beyond the library's `Game` (developer, size, favorite, notes) and the
//! data loaded lazily per page (achievements list, news, friends). Shape:
//! `docs/GAME_PAGE_SPEC.md` §0.

pub mod achievements;
pub mod markup;
pub mod news;
pub mod social;
pub mod user_data;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::model::Game;

/// What the page shows at once: the library's `Game` plus local facts.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameDetail {
    #[serde(flatten)]
    pub game: Game,
    /// Main developer, from the Store details (opt-in). `null` when unknown.
    pub developer: Option<String>,
    pub size_on_disk_bytes: Option<f64>,
    pub favorite: bool,
    /// Hidden from the library by the user.
    pub hidden: bool,
    pub notes: String,
    /// Whether Vapor found the game's folder ("Browse local files", "Stop").
    pub has_install_dir: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub api_name: String,
    pub name: String,
    pub description: Option<String>,
    /// Color icon (`vapor` URL).
    pub icon: Option<String>,
    /// Grayed icon, for locked achievements.
    pub icon_gray: Option<String>,
    pub hidden: bool,
    pub unlocked: bool,
    /// ISO 8601.
    pub unlocked_at: Option<String>,
    /// Share of all players who unlocked it.
    pub global_percent: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AchievementList {
    pub unlocked: u32,
    pub total: u32,
    /// The most attainable locked achievement (see `achievements::next_up`).
    pub next: Option<Achievement>,
    /// Every achievement, in the game's order. Empty when only the counts are known.
    pub items: Vec<Achievement>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub gid: String,
    /// ISO 8601.
    pub date: String,
    pub title: String,
    pub excerpt: String,
    /// The first picture of the post, as a thumbnail (`vapor` URL).
    pub image: Option<String>,
    pub body: Vec<markup::NewsBlock>,
    /// Whether the post can be opened on Steam.
    pub has_url: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameSocial {
    /// Friends who play or own the game, in-game first.
    pub friends: Vec<FriendOnGame>,
    /// Friend events for this game, newest first.
    pub activity: Vec<ActivityItem>,
    /// Still fetching friends' games or achievements; a `SocialUpdated` event follows.
    pub loading: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FriendOnGame {
    /// SteamID64 as a string (too large for a JavaScript number).
    pub steam_id: String,
    pub persona_name: String,
    pub avatar: Option<String>,
    /// Minutes over the last two weeks.
    pub recent_playtime_minutes: Option<u32>,
    pub status: FriendStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum FriendStatus {
    InGame,
    PlayedRecently,
    Owns,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    /// ISO 8601 date-time of the latest event in the group.
    pub date: String,
    pub kind: ActivityKind,
    pub friend: String,
    pub friend_avatar: Option<String>,
    pub count: u32,
    /// Up to two achievements, for the mini tiles.
    pub items: Vec<ActivityAchievement>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    FriendAchievements,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActivityAchievement {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub hidden: bool,
}

/// Company suffixes dropped from the developer shown in the hero kicker.
const COMPANY_SUFFIXES: &[&str] = &[
    " inc.",
    " inc",
    " llc",
    " ltd.",
    " ltd",
    " co.",
    " gmbh",
    " s.a.",
    " sa",
    " sas",
    " ab",
    " oy",
    " corp.",
    " corporation",
    " limited",
];

/// "Maddy Makes Games Inc." → "Maddy Makes Games".
pub fn short_developer(name: &str) -> String {
    let mut name = name.trim().trim_end_matches(',').trim();
    loop {
        let lower = name.to_lowercase();
        let Some(suffix) = COMPANY_SUFFIXES
            .iter()
            .find(|suffix| lower.ends_with(*suffix) && lower.len() > suffix.len())
        else {
            break;
        };
        name = name[..name.len() - suffix.len()]
            .trim_end()
            .trim_end_matches(',');
    }
    name.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_developer_names() {
        assert_eq!(
            short_developer("Maddy Makes Games Inc."),
            "Maddy Makes Games"
        );
        assert_eq!(
            short_developer("Extremely OK Games, Ltd."),
            "Extremely OK Games"
        );
        assert_eq!(short_developer("Valve"), "Valve");
        assert_eq!(short_developer("Supergiant Games, LLC"), "Supergiant Games");
        assert_eq!(short_developer("Inc."), "Inc.");
    }
}
