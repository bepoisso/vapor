//! `steamapps/appmanifest_<appid>.acf`: one per installed app.

use std::path::Path;

use keyvalues_parser::Obj;
use serde::{Deserialize, Serialize};

use super::vdf;
use crate::model::AppId;

/// `StateFlags` bits (from Steam's `EAppState`).
const STATE_UPDATE_REQUIRED: u32 = 2;
const STATE_FULLY_INSTALLED: u32 = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstalledApp {
    pub app_id: AppId,
    pub name: String,
    pub install_dir: String,
    pub state_flags: u32,
    pub size_on_disk: u64,
    /// Unix seconds.
    pub last_updated: u64,
}

impl InstalledApp {
    pub fn fully_installed(&self) -> bool {
        self.state_flags & STATE_FULLY_INSTALLED != 0
    }

    pub fn update_required(&self) -> bool {
        self.state_flags & STATE_UPDATE_REQUIRED != 0
    }
}

/// Reads every manifest of a library folder. Unreadable manifests are skipped: one broken file
/// must not hide the rest of the library.
pub fn read_library(library: &Path) -> Vec<InstalledApp> {
    let Ok(entries) = std::fs::read_dir(library.join("steamapps")) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("appmanifest_") && name.ends_with(".acf"))
        })
        .filter_map(|path| vdf::read_root(&path).ok())
        .filter_map(|root| parse(&root))
        .collect()
}

pub fn parse(root: &Obj<'_>) -> Option<InstalledApp> {
    Some(InstalledApp {
        app_id: vdf::get_num(root, "appid")?,
        name: vdf::get_str(root, "name")?.to_owned(),
        install_dir: vdf::get_str(root, "installdir")
            .unwrap_or_default()
            .to_owned(),
        state_flags: vdf::get_num(root, "StateFlags").unwrap_or_default(),
        size_on_disk: vdf::get_num(root, "SizeOnDisk").unwrap_or_default(),
        last_updated: vdf::get_num(root, "LastUpdated").unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"
"AppState"
{
	"appid"		"504230"
	"universe"		"1"
	"name"		"Celeste"
	"StateFlags"		"6"
	"installdir"		"Celeste"
	"LastUpdated"		"1700000000"
	"SizeOnDisk"		"1220000000"
}
"#;

    #[test]
    fn parses_an_app_manifest() {
        let app = parse(&vdf::parse_root(FIXTURE)).unwrap();
        assert_eq!(app.app_id, 504230);
        assert_eq!(app.name, "Celeste");
        assert!(app.fully_installed());
        assert!(app.update_required());
        assert_eq!(app.size_on_disk, 1_220_000_000);
    }
}
