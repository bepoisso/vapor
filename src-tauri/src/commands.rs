//! Tauri commands exposed to the frontend. Keep them thin: real logic lives in dedicated modules.
//! Commands are `async` so they run on the async runtime, never on the UI thread; blocking file
//! work goes to the blocking pool.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;

use crate::enrichment::service::EnrichmentService;
use crate::error::{CommandError, CommandResult, Error};
use crate::library::service::{LibraryService, LibraryUpdated};
use crate::library::shelves::ShelfStore;
use crate::library::snapshot;
use crate::library::tags::Tagging;
use crate::model::{AppId, Game, Profile, SmartShelf};
use crate::sessions::GameSessions;
use crate::settings::{self, SettingsStore};
use crate::startup::{self, FrontendMarks, ProcessStart};
use crate::steam::client::SteamAction;
use crate::steam::collections::SteamCollection;
use crate::steam::{SteamInstall, users};
use crate::web::HttpClient;

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
        .map_err(CommandError::other)?
        .map_err(CommandError::from)
}

/// Installed games. Served from Vapor's cache; a background scan emits `LibraryUpdated` if
/// anything changed.
#[tauri::command]
#[specta::specta]
pub async fn get_library(app: AppHandle) -> CommandResult<Vec<Game>> {
    let enrichment = app.state::<EnrichmentService>().current();
    let handle = app.clone();
    with_library(app, move |library| {
        let mut games = library.games(&enrichment)?;
        if library.is_steam() {
            handle
                .state::<Tagging>()
                .apply(&mut games, &enrichment.store);
        }
        Ok(games)
    })
    .await
}

/// Saves the user's vibe tags for a game (kept as edits on top of the mapped tags).
#[tauri::command]
#[specta::specta]
pub async fn set_game_tags(app: AppHandle, app_id: AppId, tags: Vec<String>) -> CommandResult<()> {
    let enrichment = app.state::<EnrichmentService>().current();
    let details = enrichment
        .store
        .get(&app_id)
        .and_then(|entry| entry.details.as_ref());
    app.state::<Tagging>().set_tags(app_id, tags, details)?;
    let _ = LibraryUpdated.emit(&app);
    Ok(())
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
    .map_err(CommandError::other)?
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
pub async fn list_shelves(shelves: State<'_, ShelfStore>) -> CommandResult<Vec<SmartShelf>> {
    Ok(shelves.list())
}

/// Creates (empty `id`) or updates a smart shelf. Returns every shelf, in order.
#[tauri::command]
#[specta::specta]
pub async fn save_shelf(
    shelves: State<'_, ShelfStore>,
    shelf: SmartShelf,
) -> CommandResult<Vec<SmartShelf>> {
    Ok(shelves.save(shelf)?)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_shelf(
    shelves: State<'_, ShelfStore>,
    id: String,
) -> CommandResult<Vec<SmartShelf>> {
    Ok(shelves.delete(&id)?)
}

/// Puts the shelves in the order of `ids`.
#[tauri::command]
#[specta::specta]
pub async fn reorder_shelves(
    shelves: State<'_, ShelfStore>,
    ids: Vec<String>,
) -> CommandResult<Vec<SmartShelf>> {
    Ok(shelves.reorder(&ids)?)
}

/// The account's Steam collections, read-only.
#[tauri::command]
#[specta::specta]
pub async fn list_collections(app: AppHandle) -> CommandResult<Vec<SteamCollection>> {
    Ok(app.state::<LibraryService>().collections())
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

// ---------------------------------------------------------------------------------------------
// Settings

/// A Steam account that logged in on this machine. IDs are strings: SteamID64s exceed what a
/// JavaScript number holds exactly.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccount {
    pub steam_id: String,
    pub persona_name: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    /// Where Vapor found Steam on its own.
    pub detected_steam_path: Option<String>,
    /// The folder chosen by the user, if any.
    pub steam_path: Option<String>,
    pub accounts: Vec<SteamAccount>,
    /// The account chosen by the user; `null` = the most recent login.
    pub account: Option<String>,
    /// The account whose library is shown.
    pub active_account: Option<String>,
    pub has_api_key: bool,
    /// Owned games known from the Web API (for the active account).
    pub owned_games: Option<u32>,
    /// ISO 8601 time of the last successful owned-games sync.
    pub owned_synced_at: Option<String>,
    pub sync_error: Option<String>,
    pub store_enrichment: bool,
    /// Games with Store details (genres, modes) when the Store opt-in is on.
    pub store_games: Option<u32>,
}

fn settings_view(app: &AppHandle) -> SettingsView {
    let settings = app.state::<Arc<SettingsStore>>();
    let current = settings.get();
    let accounts = settings
        .steam_install()
        .and_then(|steam| users::read_all(&steam.login_users_file()).ok())
        .unwrap_or_default();
    let active = app.state::<LibraryService>().active_account();
    let enrichment = app.state::<EnrichmentService>().current();
    let enrichment_is_active = enrichment.account.is_some() && enrichment.account == active;
    SettingsView {
        detected_steam_path: SteamInstall::locate()
            .ok()
            .map(|steam| steam.root().display().to_string()),
        steam_path: current.steam_path.map(|path| path.display().to_string()),
        accounts: accounts
            .into_iter()
            .map(|user| SteamAccount {
                steam_id: user.steam_id64.to_string(),
                persona_name: user.persona_name,
            })
            .collect(),
        account: current.steam_id64.map(|id| id.to_string()),
        active_account: active.map(|id| id.to_string()),
        has_api_key: settings::api_key().is_some(),
        owned_games: enrichment_is_active
            .then(|| u32::try_from(enrichment.owned.len()).ok())
            .flatten(),
        owned_synced_at: enrichment_is_active
            .then_some(enrichment.owned_synced_at)
            .flatten()
            .map(snapshot::iso8601_utc),
        sync_error: enrichment.last_error.clone(),
        store_enrichment: current.store_enrichment,
        store_games: current
            .store_enrichment
            .then(|| {
                let known = enrichment
                    .store
                    .values()
                    .filter(|entry| entry.details.is_some());
                u32::try_from(known.count()).ok()
            })
            .flatten(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_settings(app: AppHandle) -> CommandResult<SettingsView> {
    Ok(settings_view(&app))
}

/// Checks the key against the Web API (fetching the owned games), then stores it in the OS
/// keychain. A rejected key is not stored.
#[tauri::command]
#[specta::specta]
pub async fn save_api_key(app: AppHandle, key: String) -> CommandResult<SettingsView> {
    let key = key.trim().to_owned();
    if !settings::is_well_formed_api_key(&key) {
        return Err(Error::MalformedApiKey.into());
    }
    let account = app
        .state::<LibraryService>()
        .active_account()
        .ok_or(Error::SteamNotFound)?;
    let client = app.state::<HttpClient>().0.clone();
    app.state::<EnrichmentService>()
        .sync_owned(&client, &key, account)
        .await?;
    settings::set_api_key(&key)?;
    let _ = LibraryUpdated.emit(&app);
    EnrichmentService::spawn_sync(app.clone(), false);
    Ok(settings_view(&app))
}

/// Deletes the key from the keychain and forgets the data fetched with it.
#[tauri::command]
#[specta::specta]
pub async fn remove_api_key(app: AppHandle) -> CommandResult<SettingsView> {
    settings::clear_api_key()?;
    let account = app.state::<LibraryService>().active_account();
    app.state::<EnrichmentService>().reset(account);
    let _ = LibraryUpdated.emit(&app);
    Ok(settings_view(&app))
}

/// `null` returns to the detected Steam folder.
#[tauri::command]
#[specta::specta]
pub async fn set_steam_path(app: AppHandle, path: Option<String>) -> CommandResult<SettingsView> {
    let path = path
        .map(|path| path.trim().to_owned())
        .filter(|path| !path.is_empty())
        .map(PathBuf::from);
    if let Some(path) = &path
        && !SteamInstall::at(path.clone()).looks_valid()
    {
        return Err(Error::NotASteamFolder(path.clone()).into());
    }
    app.state::<Arc<SettingsStore>>()
        .update(|settings| settings.steam_path = path)?;
    LibraryService::reconfigure(&app);
    Ok(settings_view(&app))
}

/// `null` returns to the most recent login.
#[tauri::command]
#[specta::specta]
pub async fn set_account(app: AppHandle, steam_id: Option<String>) -> CommandResult<SettingsView> {
    let steam_id64 = steam_id
        .map(|id| id.parse::<u64>())
        .transpose()
        .map_err(CommandError::other)?;
    app.state::<Arc<SettingsStore>>()
        .update(|settings| settings.steam_id64 = steam_id64)?;
    LibraryService::reconfigure(&app);
    Ok(settings_view(&app))
}

/// Opt-in for the Store's unofficial `appdetails` endpoint (genres, modes). Turning it off
/// also forgets the details fetched so far.
#[tauri::command]
#[specta::specta]
pub async fn set_store_enrichment(app: AppHandle, enabled: bool) -> CommandResult<SettingsView> {
    app.state::<Arc<SettingsStore>>()
        .update(|settings| settings.store_enrichment = enabled)?;
    if enabled {
        EnrichmentService::spawn_sync(app.clone(), false);
    } else {
        app.state::<EnrichmentService>().clear_store();
        let _ = LibraryUpdated.emit(&app);
    }
    Ok(settings_view(&app))
}

/// Opens Steam's API key page in the default browser.
#[tauri::command]
#[specta::specta]
pub async fn open_api_key_page(app: AppHandle) -> CommandResult<()> {
    app.opener()
        .open_url(API_KEY_PAGE, None::<&str>)
        .map_err(CommandError::other)
}

const API_KEY_PAGE: &str = "https://steamcommunity.com/dev/apikey";
