//! Talking to the Steam client: launching and installing games, and knowing what runs.
//!
//! Games start through Steam (most need it for DRM/Steamworks). Vapor hands `steam://` URLs to
//! `steam.exe` exactly like Windows' URL handler does (`steam.exe -- "%1"`). When Steam is not
//! running, `-silent` starts it in the tray only, so no Steam window appears.

use std::path::PathBuf;
use std::process::Command;

use crate::error::Error;
use crate::model::AppId;
use crate::steam::SteamInstall;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SteamAction {
    Launch,
    Install,
}

impl SteamAction {
    pub fn url(self, app_id: AppId) -> String {
        match self {
            Self::Launch => format!("steam://rungameid/{app_id}"),
            Self::Install => format!("steam://install/{app_id}"),
        }
    }
}

/// Arguments for `steam.exe`. `-silent` only matters when this call starts Steam.
pub fn steam_args(url: &str, steam_running: bool) -> Vec<String> {
    let mut args = Vec::with_capacity(3);
    if !steam_running {
        args.push("-silent".to_owned());
    }
    args.push("--".to_owned());
    args.push(url.to_owned());
    args
}

/// Asks Steam to launch or install `app_id`. Returns as soon as the request is handed over.
pub fn request(steam: &SteamInstall, action: SteamAction, app_id: AppId) -> Result<(), Error> {
    let executable = executable(steam);
    let args = steam_args(&action.url(app_id), is_steam_running());
    Command::new(&executable)
        .args(&args)
        .spawn()
        .map(drop)
        .map_err(|source| Error::Io {
            path: executable,
            source,
        })
}

#[cfg(windows)]
fn executable(steam: &SteamInstall) -> PathBuf {
    steam.root().join("steam.exe")
}

#[cfg(not(windows))]
fn executable(_steam: &SteamInstall) -> PathBuf {
    PathBuf::from("steam")
}

/// Steam writes its PID under `ActiveProcess` and resets it to 0 on a clean exit. After a crash
/// the PID is stale, so the process must also exist and be Steam.
#[cfg(windows)]
pub fn is_steam_running() -> bool {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    let Some(pid) =
        read_steam_dword(r"Software\Valve\Steam\ActiveProcess", "pid").filter(|&pid| pid != 0)
    else {
        return false;
    };
    let pid = Pid::from_u32(pid);
    // Unknown counts as "not running": an extra `-silent` is harmless if Steam already runs.
    let Ok(mut system) = System::new() else {
        return false;
    };
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing(),
    );
    system
        .process(pid)
        .is_some_and(|process| process.name().eq_ignore_ascii_case("steam.exe"))
}

/// Without a reliable signal, assume Steam runs (no `-silent`: never start it hidden by mistake).
#[cfg(not(windows))]
pub fn is_steam_running() -> bool {
    true
}

/// The app Steam reports as running (`RunningAppID`, 0 when none).
#[cfg(windows)]
pub fn running_app() -> Option<AppId> {
    read_steam_dword(r"Software\Valve\Steam", "RunningAppID").filter(|&app_id| app_id != 0)
}

#[cfg(not(windows))]
pub fn running_app() -> Option<AppId> {
    None
}

#[cfg(windows)]
fn read_steam_dword(key: &str, value: &str) -> Option<u32> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(key)
        .ok()?
        .get_value::<u32, _>(value)
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_steam_urls() {
        assert_eq!(SteamAction::Launch.url(504230), "steam://rungameid/504230");
        assert_eq!(SteamAction::Install.url(620), "steam://install/620");
    }

    #[test]
    fn starts_steam_silently_only_when_it_is_not_running() {
        let url = "steam://rungameid/504230";
        assert_eq!(steam_args(url, false), ["-silent", "--", url]);
        assert_eq!(steam_args(url, true), ["--", url]);
    }

    /// Reads this machine's Steam state without launching anything:
    /// `cargo test steam_state -- --ignored --nocapture`
    #[test]
    #[ignore = "reads the local Steam state"]
    fn local_steam_state() {
        println!("steam running: {}", is_steam_running());
        println!("running app: {:?}", running_app());
    }
}
