//! Sample library from `mockups/data/games.sample.json`, with the mockup's local art, and the
//! game page extras of `mockups/data/game.celeste.sample.json`. Served instead of the Steam
//! install when `VAPOR_LIBRARY=sample` (mockup comparison, demos).

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Deserialize;

use crate::error::Error;
use crate::game::{
    Achievement, AchievementList, ActivityAchievement, ActivityItem, ActivityKind, FriendOnGame,
    FriendStatus, GameSocial, NewsItem,
};
use crate::images;
use crate::model::{Achievements, AppId, CloudStatus, Game, Mode, Profile};
use crate::steam::artwork::ArtPaths;

const SAMPLE_JSON: &str = include_str!("../../../mockups/data/games.sample.json");
const DETAIL_JSON: &str = include_str!("../../../mockups/data/game.celeste.sample.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleFile {
    user: SampleUser,
    games: Vec<SampleGame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleUser {
    persona_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleGame {
    app_id: AppId,
    name: String,
    genre: String,
    modes: Vec<Mode>,
    tags: Vec<String>,
    playtime_hours: Option<f64>,
    last_played: Option<String>,
    achievements: Option<Achievements>,
    #[serde(default)]
    cloud: Option<CloudStatus>,
    /// False for logos that are unreadable on dark backgrounds (the UI then shows the name).
    has_logo: bool,
}

pub struct SampleLibrary {
    pub games: Vec<Game>,
    pub art: BTreeMap<AppId, ArtPaths>,
    pub profile: Profile,
    pub detail: Option<SampleDetail>,
}

/// Game page data of the sample (one game).
#[derive(Debug, Clone)]
pub struct SampleDetail {
    pub app_id: AppId,
    pub developer: Option<String>,
    pub achievements: Option<AchievementList>,
    pub social: GameSocial,
    pub news: Vec<NewsItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailFile {
    app_id: AppId,
    developer: Option<String>,
    achievements: Option<DetailAchievements>,
    #[serde(default)]
    friends: Vec<DetailFriend>,
    #[serde(default)]
    activity: Vec<DetailActivity>,
    #[serde(default)]
    news: Vec<DetailNews>,
}

#[derive(Deserialize)]
struct DetailAchievements {
    unlocked: u32,
    total: u32,
    next: Option<DetailAchievement>,
}

#[derive(Deserialize)]
struct DetailAchievement {
    name: String,
    description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailFriend {
    steam_id: Option<String>,
    persona_name: String,
    recent_playtime_minutes: Option<u32>,
    status: FriendStatus,
}

#[derive(Deserialize)]
struct DetailActivity {
    date: String,
    friend: String,
    count: u32,
    #[serde(default)]
    items: Vec<DetailActivityItem>,
}

#[derive(Deserialize)]
struct DetailActivityItem {
    #[serde(default)]
    hidden: bool,
}

#[derive(Deserialize)]
struct DetailNews {
    gid: Option<String>,
    date: String,
    title: String,
    excerpt: String,
}

fn load_detail() -> Result<SampleDetail, Error> {
    let file: DetailFile = serde_json::from_str(DETAIL_JSON)?;
    Ok(SampleDetail {
        app_id: file.app_id,
        developer: file.developer,
        achievements: file.achievements.map(|achievements| AchievementList {
            unlocked: achievements.unlocked,
            total: achievements.total,
            next: achievements.next.map(|next| Achievement {
                api_name: String::new(),
                name: next.name,
                description: next.description,
                icon: None,
                icon_gray: None,
                hidden: false,
                unlocked: false,
                unlocked_at: None,
                global_percent: None,
            }),
            items: Vec::new(),
        }),
        social: GameSocial {
            friends: file
                .friends
                .into_iter()
                .enumerate()
                .map(|(index, friend)| FriendOnGame {
                    steam_id: friend.steam_id.unwrap_or_else(|| format!("sample-{index}")),
                    persona_name: friend.persona_name,
                    avatar: None,
                    recent_playtime_minutes: friend.recent_playtime_minutes,
                    status: friend.status,
                })
                .collect(),
            activity: file
                .activity
                .into_iter()
                .map(|activity| ActivityItem {
                    date: activity.date,
                    kind: ActivityKind::FriendAchievements,
                    friend: activity.friend,
                    friend_avatar: None,
                    count: activity.count,
                    items: activity
                        .items
                        .into_iter()
                        .map(|item| ActivityAchievement {
                            name: None,
                            icon: None,
                            hidden: item.hidden,
                        })
                        .collect(),
                })
                .collect(),
            loading: false,
        },
        news: file
            .news
            .into_iter()
            .enumerate()
            .map(|(index, news)| NewsItem {
                gid: news.gid.unwrap_or_else(|| format!("sample-{index}")),
                date: news.date,
                title: news.title,
                body: vec![crate::game::markup::NewsBlock::Paragraph {
                    spans: vec![crate::game::markup::Span {
                        text: news.excerpt.clone(),
                        ..Default::default()
                    }],
                }],
                excerpt: news.excerpt,
                image: None,
                has_url: false,
            })
            .collect(),
    })
}

/// The mockup's art folder (dev machines only; it is git-ignored).
fn art_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../mockups/assets")
}

fn art_paths(app_id: AppId) -> ArtPaths {
    let dir = art_dir();
    let existing = |name: String| Some(dir.join(name)).filter(|path| path.is_file());
    ArtPaths {
        cover: existing(format!("{app_id}_library_600x900.jpg")),
        hero: existing(format!("{app_id}_library_hero.jpg")),
        logo: existing(format!("{app_id}_logo.png")),
    }
}

pub fn load() -> Result<SampleLibrary, Error> {
    let file: SampleFile = serde_json::from_str(SAMPLE_JSON)?;
    let mut art = BTreeMap::new();
    let games = file
        .games
        .into_iter()
        .map(|sample| {
            let paths = art_paths(sample.app_id);
            let images = images::game_images(sample.app_id, &paths, sample.has_logo);
            art.insert(sample.app_id, paths);
            Game {
                app_id: sample.app_id,
                name: sample.name,
                genre: Some(sample.genre),
                modes: sample.modes,
                tags: sample.tags,
                installed: None,
                playtime_minutes: sample
                    .playtime_hours
                    .map(|hours| (hours * 60.0).round() as u32),
                last_played: sample.last_played,
                achievements: sample.achievements,
                cloud: sample.cloud,
                update_pending: None,
                images,
            }
        })
        .collect();
    Ok(SampleLibrary {
        games,
        art,
        profile: Profile {
            persona_name: Some(file.user.persona_name),
            avatar: None,
        },
        detail: Some(load_detail()?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_library_parses() {
        let library = load().unwrap();
        assert_eq!(library.games.len(), 15);
        let celeste = library
            .games
            .iter()
            .find(|game| game.app_id == 504230)
            .unwrap();
        assert_eq!(celeste.playtime_minutes, Some(2808));
        assert_eq!(celeste.genre.as_deref(), Some("Platformer"));
        assert_eq!(library.profile.persona_name.as_deref(), Some("Flitcher"));
        let detail = library.detail.unwrap();
        assert_eq!(detail.app_id, 504230);
        assert_eq!(
            detail.social.friends[0].status,
            FriendStatus::PlayedRecently
        );
        assert_eq!(
            detail
                .achievements
                .and_then(|a| a.next)
                .map(|next| next.name),
            Some("Heart of the Mountain".to_owned())
        );
    }

    #[test]
    fn games_without_a_readable_logo_have_none() {
        let library = load().unwrap();
        let cs2 = library
            .games
            .iter()
            .find(|game| game.app_id == 730)
            .unwrap();
        assert_eq!(cs2.images.logo, None);
    }
}
