//! Locating the Steam install and the files Vapor reads in it.

use std::path::{Path, PathBuf};

use crate::error::Error;

/// Offset between a SteamID64 and the 32-bit account ID used in `userdata/`.
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

#[derive(Debug, Clone)]
pub struct SteamInstall {
    root: PathBuf,
}

impl SteamInstall {
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Finds the Steam install of the current user.
    pub fn locate() -> Result<Self, Error> {
        candidates()
            .into_iter()
            .map(Self::at)
            .find(Self::looks_valid)
            .ok_or(Error::SteamNotFound)
    }

    /// True if the folder looks like a Steam install.
    pub fn looks_valid(&self) -> bool {
        self.root.join("steamapps").is_dir() || self.root.join("config").is_dir()
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn library_folders_file(&self) -> PathBuf {
        self.root.join("steamapps").join("libraryfolders.vdf")
    }

    pub fn config_dir(&self) -> PathBuf {
        self.root.join("config")
    }

    pub fn login_users_file(&self) -> PathBuf {
        self.config_dir().join("loginusers.vdf")
    }

    pub fn avatar_file(&self, steam_id64: u64) -> PathBuf {
        self.config_dir()
            .join("avatarcache")
            .join(format!("{steam_id64}.png"))
    }

    pub fn user_config_dir(&self, steam_id64: u64) -> PathBuf {
        self.root
            .join("userdata")
            .join(account_id(steam_id64).to_string())
            .join("config")
    }

    pub fn library_cache_dir(&self) -> PathBuf {
        self.root.join("appcache").join("librarycache")
    }
}

pub fn account_id(steam_id64: u64) -> u64 {
    steam_id64.saturating_sub(STEAM_ID64_BASE)
}

#[cfg(windows)]
fn candidates() -> Vec<PathBuf> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let mut roots = Vec::new();
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam")
        && let Ok(path) = key.get_value::<String, _>("SteamPath")
    {
        roots.push(PathBuf::from(path));
    }
    if let Some(program_files) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(program_files).join("Steam"));
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    roots
}

#[cfg(target_os = "linux")]
fn candidates() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    vec![
        home.join(".steam").join("steam"),
        home.join(".local").join("share").join("Steam"),
    ]
}

#[cfg(target_os = "macos")]
fn candidates() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    vec![home.join("Library/Application Support/Steam")]
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn candidates() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_steam_id64_to_account_id() {
        assert_eq!(account_id(76_561_198_071_652_620), 111_386_892);
    }
}
