//! Sample library from `mockups/data/games.sample.json`, with the mockup's local art. Served
//! instead of the Steam install when `VAPOR_LIBRARY=sample` (mockup comparison, demos).

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Deserialize;

use crate::error::Error;
use crate::images;
use crate::model::{Achievements, AppId, CloudStatus, Game, Mode, Profile};
use crate::steam::artwork::ArtPaths;

const SAMPLE_JSON: &str = include_str!("../../../mockups/data/games.sample.json");

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
