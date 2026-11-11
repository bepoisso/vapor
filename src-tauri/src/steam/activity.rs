//! Per-app activity from `userdata/<account>/config/localconfig.vdf`:
//! `UserLocalConfigStore/Software/Valve/Steam/apps/<appid>/{LastPlayed, Playtime, cloud}`.

use std::collections::HashMap;
use std::path::Path;

use keyvalues_parser::Obj;
use serde::{Deserialize, Serialize};

use super::vdf;
use crate::error::Error;
use crate::model::{AppId, CloudStatus};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppActivity {
    /// Unix seconds; `None` when never played.
    pub last_played: Option<u64>,
    pub playtime_minutes: Option<u32>,
    /// Steam's `cloud/last_sync_state`, kept raw.
    pub cloud_state: Option<String>,
}

impl AppActivity {
    /// Only states whose meaning is certain are reported; anything else is unknown.
    pub fn cloud(&self) -> Option<CloudStatus> {
        match self.cloud_state.as_deref() {
            Some("synchronized") => Some(CloudStatus::Synced),
            _ => None,
        }
    }
}

pub fn read(file: &Path) -> Result<HashMap<AppId, AppActivity>, Error> {
    Ok(parse(&vdf::read_root(file)?))
}

pub fn parse(root: &Obj<'_>) -> HashMap<AppId, AppActivity> {
    let Some(apps) = vdf::get_path(root, &["Software", "Valve", "Steam", "apps"]) else {
        return HashMap::new();
    };
    vdf::children(apps)
        .filter_map(|(id, entry)| {
            let activity = AppActivity {
                last_played: vdf::get_num(entry, "LastPlayed").filter(|&time: &u64| time > 0),
                playtime_minutes: vdf::get_num(entry, "Playtime"),
                cloud_state: vdf::get_obj(entry, "cloud")
                    .and_then(|cloud| vdf::get_str(cloud, "last_sync_state"))
                    .map(str::to_owned),
            };
            Some((id.parse().ok()?, activity))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"
"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"504230"
					{
						"LastPlayed"		"1767717569"
						"Playtime"		"2806"
						"cloud"
						{
							"last_sync_state"		"synchronized"
						}
					}
					"620"
					{
						"LastPlayed"		"0"
					}
				}
			}
		}
	}
}
"#;

    #[test]
    fn reads_playtime_last_played_and_cloud() {
        let activity = parse(&vdf::parse_root(FIXTURE));
        let celeste = &activity[&504230];
        assert_eq!(celeste.last_played, Some(1_767_717_569));
        assert_eq!(celeste.playtime_minutes, Some(2806));
        assert_eq!(celeste.cloud(), Some(CloudStatus::Synced));

        let portal = &activity[&620];
        assert_eq!(portal.last_played, None);
        assert_eq!(portal.playtime_minutes, None);
        assert_eq!(portal.cloud(), None);
    }
}
