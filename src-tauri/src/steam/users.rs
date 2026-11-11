//! `config/loginusers.vdf`: accounts that logged in on this machine.

use std::path::Path;

use keyvalues_parser::Obj;
use serde::{Deserialize, Serialize};

use super::vdf;
use crate::error::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteamUser {
    pub steam_id64: u64,
    pub persona_name: String,
    most_recent: bool,
    timestamp: u64,
}

pub fn read_active(file: &Path) -> Result<Option<SteamUser>, Error> {
    Ok(active(&vdf::read_root(file)?))
}

/// The account flagged `MostRecent`, else the one that logged in last. Recent Steam versions
/// drop `MostRecent` when only one account exists.
pub fn active(root: &Obj<'_>) -> Option<SteamUser> {
    vdf::children(root)
        .filter_map(|(id, entry)| {
            Some(SteamUser {
                steam_id64: id.parse().ok()?,
                persona_name: vdf::get_str(entry, "PersonaName")
                    .unwrap_or_default()
                    .to_owned(),
                most_recent: vdf::get_str(entry, "MostRecent") == Some("1"),
                timestamp: vdf::get_num(entry, "Timestamp").unwrap_or_default(),
            })
        })
        .max_by_key(|user| (user.most_recent, user.timestamp))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_most_recent_account() {
        let root = vdf::parse_root(
            r#"
"users"
{
	"76561198000000001"
	{
		"PersonaName"		"Old"
		"MostRecent"		"0"
		"Timestamp"		"1900000000"
	}
	"76561198071652620"
	{
		"PersonaName"		"Flitcher"
		"MostRecent"		"1"
		"Timestamp"		"1700000000"
	}
}
"#,
        );
        let user = active(&root).unwrap();
        assert_eq!(user.steam_id64, 76_561_198_071_652_620);
        assert_eq!(user.persona_name, "Flitcher");
    }

    #[test]
    fn falls_back_to_the_latest_login_without_most_recent() {
        let root = vdf::parse_root(
            r#"
"users"
{
	"76561198000000001" { "PersonaName" "A" "timestamp" "100" }
	"76561198000000002" { "PersonaName" "B" "timestamp" "200" }
}
"#,
        );
        assert_eq!(active(&root).unwrap().persona_name, "B");
    }
}
