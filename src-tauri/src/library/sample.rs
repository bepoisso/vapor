//! Sample library from `mockups/data/games.sample.json`, mapped to the real data model.

use serde::Deserialize;

use crate::error::Error;
use crate::images::{ImageKind, ImageStore};
use crate::model::{Achievements, AppId, CloudStatus, Game, GameImages, Mode};

const SAMPLE_JSON: &str = include_str!("../../../mockups/data/games.sample.json");

#[derive(Deserialize)]
struct SampleFile {
    games: Vec<SampleGame>,
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

pub fn load(images: &ImageStore) -> Result<Vec<Game>, Error> {
    let file: SampleFile = serde_json::from_str(SAMPLE_JSON)?;
    Ok(file
        .games
        .into_iter()
        .map(|game| to_game(game, images))
        .collect())
}

fn to_game(sample: SampleGame, images: &ImageStore) -> Game {
    let id = sample.app_id;
    Game {
        app_id: id,
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
        images: GameImages {
            cover: images.url_if_exists(id, ImageKind::Cover),
            hero: images.url_if_exists(id, ImageKind::Hero),
            logo: sample
                .has_logo
                .then(|| images.url_if_exists(id, ImageKind::Logo))
                .flatten(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_library_parses() {
        let games = load(&ImageStore::sample()).unwrap();
        assert_eq!(games.len(), 15);
        let celeste = games.iter().find(|game| game.app_id == 504230).unwrap();
        assert_eq!(celeste.playtime_minutes, Some(2808));
        assert_eq!(celeste.genre.as_deref(), Some("Platformer"));
    }

    #[test]
    fn games_without_a_readable_logo_have_none() {
        let games = load(&ImageStore::sample()).unwrap();
        let cs2 = games.iter().find(|game| game.app_id == 730).unwrap();
        assert_eq!(cs2.images.logo, None);
    }
}
