//! Tauri commands exposed to the frontend. Keep them thin: real logic lives in dedicated modules.
//! Commands are `async` so they run on the async runtime, never on the UI thread; blocking file
//! work goes to the blocking pool.

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};

use crate::error::{CommandError, CommandResult};
use crate::library::{self, service::LibraryService};
use crate::model::{Game, Profile, SmartShelf};
use crate::startup::{self, FrontendMarks, ProcessStart};

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
