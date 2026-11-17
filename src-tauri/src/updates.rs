//! Signed auto-update from GitHub Releases (`tauri-plugin-updater`). The release workflow
//! publishes `latest.json` with each release; Vapor checks it, and installs a newer version only
//! when its signature matches the public key in `tauri.conf.json`.

use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{CommandResult, Error};

/// A newer version, as the release describes it.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// Release notes (Markdown), if any.
    pub notes: Option<String>,
    /// ISO 8601 publication date, if known.
    pub date: Option<String>,
}

/// The update found by the last check, ready to install.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

fn update_error(error: impl std::fmt::Display) -> Error {
    Error::Update(error.to_string())
}

/// Asks GitHub Releases for a newer version. `null` when Vapor is up to date.
#[tauri::command]
#[specta::specta]
pub async fn check_for_update(app: AppHandle) -> CommandResult<Option<UpdateInfo>> {
    let update = app
        .updater()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?;
    let info = update.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
        date: update.date.map(|date| date.to_string()),
    });
    *app.state::<PendingUpdate>()
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = update;
    Ok(info)
}

/// Downloads and installs the update found by the last check, then restarts Vapor.
#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle) -> CommandResult<()> {
    let pending = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
    let update = match pending {
        Some(update) => update,
        None => app
            .updater()
            .map_err(update_error)?
            .check()
            .await
            .map_err(update_error)?
            .ok_or_else(|| update_error("Vapor is already up to date"))?,
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(update_error)?;
    app.restart()
}
