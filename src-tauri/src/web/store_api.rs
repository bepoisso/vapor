//! Steam Store `appdetails`: app type, genres and categories (single-player, co-op, PvP…).
//!
//! **Unofficial**: Valve does not document this endpoint and rate-limits it (~200 requests per
//! 5 minutes). Only called when the user opts in (Settings → Store data), one app at a time,
//! and results are cached for a month (see `enrichment::service`).

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::network_error;
use crate::error::Error;
use crate::model::AppId;

const APP_DETAILS_URL: &str = "https://store.steampowered.com/api/appdetails";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreDetails {
    /// `game`, `demo`, `dlc`, `application`, `tool`…
    pub app_type: String,
    /// English genre names, in Store order ("Action", "Indie"…).
    pub genres: Vec<String>,
    /// Store category IDs (2 = Single-player, 9 = Co-op, 49 = PvP…).
    pub categories: Vec<u32>,
}

#[derive(Deserialize)]
struct Entry {
    success: bool,
    data: Option<Data>,
}

#[derive(Deserialize)]
struct Data {
    #[serde(rename = "type")]
    app_type: String,
    #[serde(default)]
    genres: Vec<Genre>,
    #[serde(default)]
    categories: Vec<Category>,
}

#[derive(Deserialize)]
struct Genre {
    description: String,
}

#[derive(Deserialize)]
struct Category {
    id: u32,
}

/// What the Store answered for one app.
#[derive(Debug, PartialEq, Eq)]
pub enum StoreAnswer {
    Details(StoreDetails),
    /// The Store has no page for it (removed, region-locked, never released).
    Unknown,
    /// Too many requests: stop and try again later.
    RateLimited,
}

pub async fn app_details(client: &Client, app_id: AppId) -> Result<StoreAnswer, Error> {
    let response = client
        .get(APP_DETAILS_URL)
        .query(&[
            ("appids", app_id.to_string().as_str()),
            ("l", "english"),
            ("filters", "basic,genres,categories"),
        ])
        .send()
        .await
        .map_err(network_error)?;
    if matches!(
        response.status(),
        StatusCode::TOO_MANY_REQUESTS | StatusCode::FORBIDDEN
    ) {
        return Ok(StoreAnswer::RateLimited);
    }
    let body: HashMap<String, Entry> = response
        .error_for_status()
        .map_err(network_error)?
        .json()
        .await
        .map_err(network_error)?;
    Ok(parse(body, app_id))
}

fn parse(mut body: HashMap<String, Entry>, app_id: AppId) -> StoreAnswer {
    match body.remove(&app_id.to_string()) {
        Some(Entry {
            success: true,
            data: Some(data),
        }) => StoreAnswer::Details(StoreDetails {
            app_type: data.app_type,
            genres: data
                .genres
                .into_iter()
                .map(|genre| genre.description)
                .collect(),
            categories: data
                .categories
                .into_iter()
                .map(|category| category.id)
                .collect(),
        }),
        _ => StoreAnswer::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_app_details() {
        let body = serde_json::from_str(
            r#"{"620":{"success":true,"data":{"type":"game","name":"Portal 2",
                "genres":[{"id":"1","description":"Action"},{"id":"25","description":"Adventure"}],
                "categories":[{"id":2,"description":"Single-player"},{"id":9,"description":"Co-op"}]}}}"#,
        )
        .unwrap();
        assert_eq!(
            parse(body, 620),
            StoreAnswer::Details(StoreDetails {
                app_type: "game".into(),
                genres: vec!["Action".into(), "Adventure".into()],
                categories: vec![2, 9],
            })
        );
    }

    #[test]
    fn unknown_apps_have_no_details() {
        let body = serde_json::from_str(r#"{"1":{"success":false}}"#).unwrap();
        assert_eq!(parse(body, 1), StoreAnswer::Unknown);
    }
}
