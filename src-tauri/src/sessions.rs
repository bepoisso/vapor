//! Game sessions: launch and install requests, and the "running" indicator on Play buttons.

use std::sync::Arc;
#[cfg(windows)]
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::error::Error;
use crate::model::AppId;
use crate::settings::SettingsStore;
use crate::steam::client::{self, SteamAction};

/// Steam updates `RunningAppID` within a second or two of a game starting or exiting.
#[cfg(windows)]
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Emitted when the game Steam reports as running changes (`null`: none).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct RunningGameChanged {
    pub app_id: Option<AppId>,
}

pub struct GameSessions {
    settings: Arc<SettingsStore>,
}

impl GameSessions {
    pub fn new(settings: Arc<SettingsStore>) -> Self {
        Self { settings }
    }

    pub fn request(&self, action: SteamAction, app_id: AppId) -> Result<(), Error> {
        let steam = self.settings.steam_install().ok_or(Error::SteamNotFound)?;
        client::request(&steam, action, app_id)
    }

    pub fn running_game(&self) -> Option<AppId> {
        client::running_app()
    }

    /// Polls Steam's running app and emits `RunningGameChanged` on every change.
    #[cfg(windows)]
    pub fn watch_running_game(app: AppHandle) {
        std::thread::spawn(move || {
            let mut last = client::running_app();
            loop {
                std::thread::sleep(POLL_INTERVAL);
                let current = client::running_app();
                if current != last {
                    last = current;
                    let _ = RunningGameChanged { app_id: current }.emit(&app);
                }
            }
        });
    }

    /// No reliable running-game signal outside Windows yet.
    #[cfg(not(windows))]
    pub fn watch_running_game(_app: AppHandle) {}
}
