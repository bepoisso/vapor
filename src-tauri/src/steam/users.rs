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

pub fn read_all(file: &Path) -> Result<Vec<SteamUser>, Error> {
    Ok(all(&vdf::read_root(file)?))
}

/// The account to show: `preferred` if it logged in on this machine, else `active`.
pub fn select(users: &[SteamUser], preferred: Option<u64>) -> Option<SteamUser> {
    preferred
        .and_then(|id| users.iter().find(|user| user.steam_id64 == id))
        .or_else(|| active_of(users))
        .cloned()
}

/// The account flagged `MostRecent`, else the one that logged in last. Recent Steam versions
/// drop `MostRecent` when only one account exists.
fn active_of(users: &[SteamUser]) -> Option<&SteamUser> {
    users
        .iter()
        .max_by_key(|user| (user.most_recent, user.timestamp))
}

#[cfg(test)]
pub fn active(root: &Obj<'_>) -> Option<SteamUser> {
    active_of(&all(root)).cloned()
}

/// Every account that logged in on this machine.
pub fn all(root: &Obj<'_>) -> Vec<SteamUser> {
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
        .collect()
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
    fn prefers_the_chosen_account_when_it_exists() {
        let root = vdf::parse_root(
            r#"
"users"
{
	"76561198000000001" { "PersonaName" "A" "MostRecent" "1" }
	"76561198000000002" { "PersonaName" "B" }
}
"#,
        );
        let users = all(&root);
        assert_eq!(
            select(&users, Some(76_561_198_000_000_002))
                .unwrap()
                .persona_name,
            "B"
        );
        assert_eq!(select(&users, Some(1)).unwrap().persona_name, "A");
        assert_eq!(select(&users, None).unwrap().persona_name, "A");
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
