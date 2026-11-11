//! Tauri commands exposed to the frontend. Keep them thin: real logic lives in dedicated modules.
//! Commands are `async` so they run on the async runtime, never on the UI thread.

use serde::Serialize;
use specta::Type;
use tauri::State;

use crate::error::CommandResult;
use crate::images::ImageStore;
use crate::library;
use crate::model::{Game, SmartShelf};
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
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
    }
}

/// The whole library. Phase 1: sample data.
#[tauri::command]
#[specta::specta]
pub async fn get_library(images: State<'_, ImageStore>) -> CommandResult<Vec<Game>> {
    Ok(library::sample::load(&images)?)
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
