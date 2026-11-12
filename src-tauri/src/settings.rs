//! User settings. Plain preferences live in `settings.json` in the OS config dir; the Steam Web
//! API key lives in the OS keychain (Windows Credential Manager), never in a file.

use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::steam::SteamInstall;

const SETTINGS_FILE: &str = "settings.json";
const KEYCHAIN_SERVICE: &str = "io.github.bepoisso.vapor";
const KEYCHAIN_USER: &str = "steam-web-api-key";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Steam folder chosen by the user; `None` = detected automatically.
    pub steam_path: Option<PathBuf>,
    /// Account chosen by the user (SteamID64); `None` = the most recent login.
    pub steam_id64: Option<u64>,
    /// Opt-in: fetch genres and modes from the Steam Store's unofficial `appdetails` endpoint.
    pub store_enrichment: bool,
}

pub struct SettingsStore {
    file: PathBuf,
    data: RwLock<Settings>,
}

impl SettingsStore {
    /// Loads `settings.json`; a missing or unreadable file gives the defaults.
    pub fn load(config_dir: &Path) -> Self {
        let file = config_dir.join(SETTINGS_FILE);
        let data = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            file,
            data: RwLock::new(data),
        }
    }

    pub fn get(&self) -> Settings {
        self.data
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Applies `change` and saves. Returns the new settings.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> Result<Settings, Error> {
        let mut data = self.data.write().unwrap_or_else(PoisonError::into_inner);
        let mut next = data.clone();
        change(&mut next);
        let io_error = |source| Error::Io {
            path: self.file.clone(),
            source,
        };
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir).map_err(io_error)?;
        }
        std::fs::write(&self.file, serde_json::to_vec_pretty(&next)?).map_err(io_error)?;
        *data = next.clone();
        Ok(next)
    }

    /// The Steam install to use: the user's folder if it is a Steam folder, else the detected one.
    pub fn steam_install(&self) -> Option<SteamInstall> {
        self.get()
            .steam_path
            .map(SteamInstall::at)
            .filter(SteamInstall::looks_valid)
            .or_else(|| SteamInstall::locate().ok())
    }
}

/// A Steam Web API key is 32 hexadecimal characters.
pub fn is_well_formed_api_key(key: &str) -> bool {
    key.len() == 32 && key.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn keychain_entry() -> Result<keyring::Entry, Error> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|error| Error::Keychain(error.to_string()))
}

/// The stored API key, if any. Keychain errors read as "no key".
pub fn api_key() -> Option<String> {
    keychain_entry().ok()?.get_password().ok()
}

pub fn set_api_key(key: &str) -> Result<(), Error> {
    let key = key.trim();
    if !is_well_formed_api_key(key) {
        return Err(Error::MalformedApiKey);
    }
    keychain_entry()?
        .set_password(key)
        .map_err(|error| Error::Keychain(error.to_string()))
}

pub fn clear_api_key() -> Result<(), Error> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(Error::Keychain(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_api_key_format() {
        assert!(is_well_formed_api_key("0123456789ABCDEF0123456789abcdef"));
        assert!(!is_well_formed_api_key("0123456789ABCDEF0123456789abcde"));
        assert!(!is_well_formed_api_key("0123456789ABCDEF0123456789abcdeg"));
    }

    #[test]
    fn settings_round_trip_and_default_when_missing() {
        let dir = std::env::temp_dir().join(format!("vapor-settings-test-{}", std::process::id()));
        let store = SettingsStore::load(&dir);
        assert_eq!(store.get(), Settings::default());

        store
            .update(|settings| {
                settings.steam_id64 = Some(76_561_198_071_652_620);
                settings.store_enrichment = true;
            })
            .unwrap();
        let reloaded = SettingsStore::load(&dir);
        assert_eq!(reloaded.get().steam_id64, Some(76_561_198_071_652_620));
        assert!(reloaded.get().store_enrichment);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
