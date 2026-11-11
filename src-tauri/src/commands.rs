//! Tauri commands exposed to the frontend. Keep them thin: real logic lives in dedicated modules.
//! Commands are `async` so they run on the async runtime, never on the UI thread; blocking file
//! work goes to the blocking pool.

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};

use crate::error::{CommandError, CommandResult};
use crate::library::{self, service::LibraryService};
use crate::model::{AppId, Game, Profile, SmartShelf};
use crate::sessions::GameSessions;
use crate::startup::{self, FrontendMarks, ProcessStart};
use crate::steam::client::SteamAction;

/// Static information about the running build.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
#[specta::specta]
pub fn app_info(app: AppHandle) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
    }
}

/// Runs `work` with the library service on the blocking pool (it may scan Steam's files).
async fn with_library<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&LibraryService) -> Result<T, crate::error::Error> + Send + 'static,
) -> CommandResult<T> {
    tauri::async_runtime::spawn_blocking(move || work(&app.state::<LibraryService>()))
        .await
        .map_err(|error| CommandError {
            message: error.to_string(),
        })?
        .map_err(CommandError::from)
}

/// Installed games. Served from Vapor's cache; a background scan emits `LibraryUpdated` if
/// anything changed.
#[tauri::command]
#[specta::specta]
pub async fn get_library(app: AppHandle) -> CommandResult<Vec<Game>> {
    with_library(app, LibraryService::games).await
}

/// The Steam account whose library is shown.
#[tauri::command]
#[specta::specta]
pub async fn get_profile(app: AppHandle) -> CommandResult<Profile> {
    with_library(app, LibraryService::profile).await
}

/// Asks Steam to launch a game (starting Steam silently in the tray if needed).
#[tauri::command]
#[specta::specta]
pub async fn launch_game(app: AppHandle, app_id: AppId) -> CommandResult<()> {
    request_steam(app, SteamAction::Launch, app_id).await
}

/// Asks Steam to install a game. Steam shows its own install dialog (drive, size).
#[tauri::command]
#[specta::specta]
pub async fn install_game(app: AppHandle, app_id: AppId) -> CommandResult<()> {
    request_steam(app, SteamAction::Install, app_id).await
}

async fn request_steam(app: AppHandle, action: SteamAction, app_id: AppId) -> CommandResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<GameSessions>().request(action, app_id)
    })
    .await
    .map_err(|error| CommandError {
        message: error.to_string(),
    })?
    .map_err(CommandError::from)
}

/// The game Steam reports as running, if any. Changes arrive as `RunningGameChanged` events.
#[tauri::command]
#[specta::specta]
pub async fn get_running_game(sessions: State<'_, GameSessions>) -> CommandResult<Option<AppId>> {
    Ok(sessions.running_game())
}

#[tauri::command]
#[specta::specta]
pub async fn list_shelves() -> CommandResult<Vec<SmartShelf>> {
    Ok(library::shelves::defaults())
}

/// Receives the frontend's startup marks (see `startup.rs`). No-op unless tracing is enabled.
#[tauri::command]
#[specta::specta]
pub async fn report_startup(
    process_start: State<'_, ProcessStart>,
    marks: FrontendMarks,
) -> CommandResult<()> {
    startup::record(&process_start, &marks);
    Ok(())
}
