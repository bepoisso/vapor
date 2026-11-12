//! The user's Steam collections, read-only, from
//! `userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json`: an array of
//! `[key, entry]` pairs where `user-collections.<id>` entries hold a JSON string value
//! `{ "id", "name", "added": [appids], "removed": [...] }`. Dynamic collections (`filterSpec`),
//! deleted ones and Steam's "hidden" collection are skipped. Vapor never writes this file.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::model::AppId;

const PREFIX: &str = "user-collections.";
/// Steam's collection of games the user hid from the library.
const HIDDEN_ID: &str = "hidden";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SteamCollection {
    pub id: String,
    pub name: String,
    pub app_ids: Vec<AppId>,
}

#[derive(Deserialize)]
struct Entry {
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    is_deleted: bool,
}

#[derive(Deserialize)]
struct Value {
    id: String,
    name: String,
    #[serde(default)]
    added: Vec<AppId>,
    #[serde(default)]
    removed: Vec<AppId>,
    #[serde(rename = "filterSpec")]
    filter_spec: Option<serde_json::Value>,
}

pub fn read(file: &Path) -> Vec<SteamCollection> {
    std::fs::read_to_string(file)
        .map(|text| parse(&text))
        .unwrap_or_default()
}

pub fn parse(text: &str) -> Vec<SteamCollection> {
    let Ok(pairs) = serde_json::from_str::<Vec<(String, serde_json::Value)>>(text) else {
        return Vec::new();
    };
    let mut collections: Vec<SteamCollection> = pairs
        .into_iter()
        .filter(|(key, _)| key.starts_with(PREFIX))
        .filter_map(|(_, entry)| serde_json::from_value::<Entry>(entry).ok())
        .filter(|entry| !entry.is_deleted)
        .filter_map(|entry| serde_json::from_str::<Value>(&entry.value?).ok())
        .filter(|value| value.filter_spec.is_none() && value.id != HIDDEN_ID)
        .map(|value| SteamCollection {
            app_ids: value
                .added
                .into_iter()
                .filter(|app_id| !value.removed.contains(app_id))
                .collect(),
            id: value.id,
            name: value.name,
        })
        .filter(|collection| !collection.app_ids.is_empty())
        .collect();
    // Favorites first, then by name.
    collections.sort_by(|a, b| {
        (b.id == "favorite")
            .cmp(&(a.id == "favorite"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    collections
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_static_collections_and_skips_the_rest() {
        let text = r#"[
            ["user-collections.uc-b", {"key":"user-collections.uc-b","timestamp":1,"value":"{\"id\":\"uc-b\",\"name\":\"Valve\",\"added\":[220,620,400],\"removed\":[400]}","version":"1"}],
            ["user-collections.favorite", {"key":"user-collections.favorite","timestamp":1,"value":"{\"id\":\"favorite\",\"name\":\"Favoris\",\"added\":[504230],\"removed\":[]}","version":"2"}],
            ["user-collections.hidden", {"key":"user-collections.hidden","timestamp":1,"value":"{\"id\":\"hidden\",\"name\":\"Masqués\",\"added\":[730],\"removed\":[]}","version":"3"}],
            ["user-collections.uc-gone", {"key":"user-collections.uc-gone","timestamp":1,"is_deleted":true,"version":"4"}],
            ["user-collections.uc-dyn", {"key":"user-collections.uc-dyn","timestamp":1,"value":"{\"id\":\"uc-dyn\",\"name\":\"Dynamic\",\"added\":[],\"removed\":[],\"filterSpec\":{\"nFormatVersion\":2}}","version":"5"}],
            ["showcases.1", {"key":"showcases.1","timestamp":1,"value":"{}","version":"6"}]
        ]"#;
        let collections = parse(text);
        assert_eq!(
            collections,
            vec![
                SteamCollection {
                    id: "favorite".into(),
                    name: "Favoris".into(),
                    app_ids: vec![504230]
                },
                SteamCollection {
                    id: "uc-b".into(),
                    name: "Valve".into(),
                    app_ids: vec![220, 620]
                },
            ]
        );
    }

    #[test]
    fn unreadable_files_give_no_collections() {
        assert!(parse("not json").is_empty());
    }
}
