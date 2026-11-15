//! Tauri commands exposed to the frontend. Keep them thin: real logic lives in dedicated modules.
//! Commands are `async` so they run on the async runtime, never on the UI thread; blocking file
//! work goes to the blocking pool.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;

use crate::enrichment::service::EnrichmentService;
use crate::error::{CommandError, CommandResult, Error};
use crate::game::achievements::{self, AchievementsService};
use crate::game::news::{self, NewsService};
use crate::game::social::SocialService;
use crate::game::user_data::GameUserData;
use crate::game::{self, AchievementList, GameDetail, GameSocial, NewsItem};
use crate::library::service::{LibraryService, LibraryUpdated};
use crate::library::shelves::{FAVORITES_SHELF_ID, ShelfStore};
use crate::library::snapshot;
use crate::library::tags::{Classification, Tagging};
use crate::model::{AppId, Game, Mode, Profile, Shelf, ShelfKind};
use crate::remote_images::RemoteImages;
use crate::sessions::GameSessions;
use crate::settings::{self, SettingsStore};
use crate::startup::{self, FrontendMarks, ProcessStart};
use crate::steam::client::{self, SteamAction};
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

/// The library's games (hidden ones left out). Served from Vapor's cache; a background scan
/// emits `LibraryUpdated` if anything changed.
#[tauri::command]
#[specta::specta]
pub async fn get_library(app: AppHandle) -> CommandResult<Vec<Game>> {
    let handle = app.clone();
    with_library(app, move |library| {
        let mut games = tagged_games(&handle, library)?;
        let hidden = handle.state::<GameUserData>().hidden();
        games.retain(|game| !hidden.contains(&game.app_id));
        Ok(games)
    })
    .await
}

/// Saves the user's vibe tags for a game (kept as edits on top of the mapped tags).
#[tauri::command]
#[specta::specta]
pub async fn set_game_tags(app: AppHandle, app_id: AppId, tags: Vec<String>) -> CommandResult<()> {
    let handle = app.clone();
    with_library(app, move |library| {
        let base = base_classification(&handle, library, app_id)?;
        handle.state::<Tagging>().set_tags(app_id, tags, &base)?;
        let _ = LibraryUpdated.emit(&handle);
        Ok(())
    })
    .await
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

/// Fills in the games of manual and Steam shelves: Favorites from the favorite toggles (Steam's
/// Favorites collection plus the user's changes), Steam shelves from their collection (`null`
/// when it no longer exists, or before the library is read).
fn with_games(app: &AppHandle, shelves: Vec<Shelf>) -> Vec<Shelf> {
    let library = app.state::<LibraryService>();
    let collections = library.collections();
    let favorites = app
        .state::<GameUserData>()
        .favorites(&library.steam_favorites());
    shelves
        .into_iter()
        .map(|mut shelf| {
            shelf.app_ids = match shelf.kind {
                ShelfKind::Smart => None,
                ShelfKind::Manual if shelf.id == FAVORITES_SHELF_ID => Some(favorites.clone()),
                ShelfKind::Manual => Some(Vec::new()),
                ShelfKind::Steam => collections
                    .iter()
                    .find(|collection| Some(&collection.id) == shelf.steam_collection_id.as_ref())
                    .map(|collection| collection.app_ids.clone()),
            };
            shelf
        })
        .collect()
}

/// Every shelf, in order (smart, Favorites, imported Steam collections).
#[tauri::command]
#[specta::specta]
pub async fn list_shelves(app: AppHandle) -> CommandResult<Vec<Shelf>> {
    let store = app.state::<ShelfStore>();
    // Shelves migrated from the first format get back the collections the library showed.
    store.finish_migration(&app.state::<LibraryService>().collections())?;
    Ok(with_games(&app, store.list()))
}

/// Creates (empty `id`, a smart shelf) or updates a shelf's settings. Returns every shelf.
#[tauri::command]
#[specta::specta]
pub async fn save_shelf(app: AppHandle, shelf: Shelf) -> CommandResult<Vec<Shelf>> {
    let shelves = app.state::<ShelfStore>().save(shelf)?;
    Ok(with_games(&app, shelves))
}

/// Deletes a shelf (Favorites can only be hidden). Steam collections are never touched.
#[tauri::command]
#[specta::specta]
pub async fn delete_shelf(app: AppHandle, id: String) -> CommandResult<Vec<Shelf>> {
    let shelves = app.state::<ShelfStore>().delete(&id)?;
    Ok(with_games(&app, shelves))
}

/// Puts the shelves in the order of `ids`.
#[tauri::command]
#[specta::specta]
pub async fn reorder_shelves(app: AppHandle, ids: Vec<String>) -> CommandResult<Vec<Shelf>> {
    let shelves = app.state::<ShelfStore>().reorder(&ids)?;
    Ok(with_games(&app, shelves))
}

/// Adds the account's Steam collections as read-only shelves, hidden until the user shows them.
#[tauri::command]
#[specta::specta]
pub async fn import_steam_collections(app: AppHandle) -> CommandResult<Vec<Shelf>> {
    let collections = app.state::<LibraryService>().collections();
    let shelves = app.state::<ShelfStore>().import_collections(&collections)?;
    Ok(with_games(&app, shelves))
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
    app.state::<SocialService>().reset();
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

// ---------------------------------------------------------------------------------------------
// Game page

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

/// Every game with genres, modes and tags applied, hidden ones included.
fn tagged_games(app: &AppHandle, library: &LibraryService) -> Result<Vec<Game>, Error> {
    let enrichment = app.state::<EnrichmentService>().current();
    let mut games = library.games(&enrichment)?;
    // The sample has its own tags; Store details cached for the real library don't apply.
    let no_store = BTreeMap::new();
    let store = if library.is_steam() {
        &enrichment.store
    } else {
        &no_store
    };
    app.state::<Tagging>().apply(&mut games, store);
    Ok(games)
}

/// A game's genre, modes and tags before the user's edits.
fn base_classification(
    app: &AppHandle,
    library: &LibraryService,
    app_id: AppId,
) -> Result<Classification, Error> {
    let enrichment = app.state::<EnrichmentService>().current();
    let game = library
        .games(&enrichment)?
        .into_iter()
        .find(|game| game.app_id == app_id)
        .ok_or(Error::UnknownGame(app_id))?;
    let details = enrichment
        .store
        .get(&app_id)
        .and_then(|entry| entry.details.as_ref())
        .filter(|_| library.is_steam());
    Ok(app.state::<Tagging>().base(&game, details))
}

/// Everything the game page shows at once (the library's data plus local facts). `null` when
/// the game is not in the library.
#[tauri::command]
#[specta::specta]
pub async fn get_game(app: AppHandle, app_id: AppId) -> CommandResult<Option<GameDetail>> {
    let handle = app.clone();
    with_library(app, move |library| {
        let Some(game) = tagged_games(&handle, library)?
            .into_iter()
            .find(|game| game.app_id == app_id)
        else {
            return Ok(None);
        };
        let user = handle.state::<GameUserData>();
        let enrichment = handle.state::<EnrichmentService>().current();
        let developer = match library.sample_detail(app_id) {
            Some(sample) => sample.developer.clone(),
            None => enrichment
                .store
                .get(&app_id)
                .and_then(|entry| entry.details.as_ref())
                .and_then(|details| details.developers.as_ref()?.first().cloned())
                .map(|name| game::short_developer(&name)),
        };
        let size_on_disk_bytes = library
            .installed_app(app_id)
            .map(|installed| installed.size_on_disk)
            .filter(|&bytes| bytes > 0)
            .map(|bytes| bytes as f64);
        Ok(Some(GameDetail {
            developer,
            size_on_disk_bytes,
            favorite: user.is_favorite(app_id, library.steam_favorites().contains(&app_id)),
            hidden: user.is_hidden(app_id),
            notes: user.notes(app_id),
            has_install_dir: library.install_dir(app_id).is_some(),
            game,
        }))
    })
    .await
}

/// The game's achievements with names, icons and rarity. `null` without an API key or for
/// games without achievements.
#[tauri::command]
#[specta::specta]
pub async fn get_game_achievements(
    app: AppHandle,
    app_id: AppId,
) -> CommandResult<Option<AchievementList>> {
    let (sample, is_steam, account) = {
        let library = app.state::<LibraryService>();
        (
            library
                .sample_detail(app_id)
                .map(|detail| detail.achievements.clone()),
            library.is_steam(),
            library.active_account(),
        )
    };
    if let Some(sample) = sample {
        return Ok(sample);
    }
    let (true, Some(key), Some(account)) = (is_steam, settings::api_key(), account) else {
        return Ok(None);
    };
    let last_played = app
        .state::<EnrichmentService>()
        .current()
        .owned
        .iter()
        .find(|game| game.app_id == app_id)
        .and_then(|game| game.last_played);
    let client = app.state::<HttpClient>().0.clone();
    let cached = app
        .state::<AchievementsService>()
        .get(&client, &key, account, app_id, last_played, now_unix())
        .await?;
    Ok(achievements::to_list(&cached, &app.state::<RemoteImages>()))
}

/// The developer's latest announcements for the game.
#[tauri::command]
#[specta::specta]
pub async fn get_game_news(app: AppHandle, app_id: AppId) -> CommandResult<Vec<NewsItem>> {
    let (sample, is_steam) = {
        let library = app.state::<LibraryService>();
        (
            library
                .sample_detail(app_id)
                .map(|detail| detail.news.clone()),
            library.is_steam(),
        )
    };
    if let Some(sample) = sample {
        return Ok(sample);
    }
    if !is_steam {
        return Ok(Vec::new());
    }
    let client = app.state::<HttpClient>().0.clone();
    let raw = app
        .state::<NewsService>()
        .get(&client, app_id, now_unix())
        .await?;
    let remote = app.state::<RemoteImages>();
    Ok(raw
        .iter()
        .map(|item| news::to_item(item, &remote))
        .collect())
}

/// Friends who play or own the game, and their recent achievements in it. `null` without an
/// API key or a visible friends list. More may follow through `SocialUpdated`.
#[tauri::command]
#[specta::specta]
pub async fn get_game_social(app: AppHandle, app_id: AppId) -> CommandResult<Option<GameSocial>> {
    let (sample, is_steam) = {
        let library = app.state::<LibraryService>();
        (
            library
                .sample_detail(app_id)
                .map(|detail| detail.social.clone()),
            library.is_steam(),
        )
    };
    if let Some(sample) = sample {
        return Ok(Some(sample));
    }
    if !is_steam {
        return Ok(None);
    }
    Ok(SocialService::get(&app, app_id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn set_favorite(app: AppHandle, app_id: AppId, favorite: bool) -> CommandResult<()> {
    let in_steam = app
        .state::<LibraryService>()
        .steam_favorites()
        .contains(&app_id);
    app.state::<GameUserData>()
        .set_favorite(app_id, favorite, in_steam)?;
    let _ = LibraryUpdated.emit(&app);
    Ok(())
}

/// Hides a game from the library (Settings lists hidden games).
#[tauri::command]
#[specta::specta]
pub async fn set_hidden(app: AppHandle, app_id: AppId, hidden: bool) -> CommandResult<()> {
    app.state::<GameUserData>().set_hidden(app_id, hidden)?;
    let _ = LibraryUpdated.emit(&app);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HiddenGame {
    pub app_id: AppId,
    pub name: String,
}

/// Games the user hid from the library.
#[tauri::command]
#[specta::specta]
pub async fn list_hidden_games(app: AppHandle) -> CommandResult<Vec<HiddenGame>> {
    let handle = app.clone();
    with_library(app, move |library| {
        let hidden = handle.state::<GameUserData>().hidden();
        let mut games: Vec<HiddenGame> = library
            .games(&handle.state::<EnrichmentService>().current())?
            .into_iter()
            .filter(|game| hidden.contains(&game.app_id))
            .map(|game| HiddenGame {
                app_id: game.app_id,
                name: game.name,
            })
            .collect();
        games.sort_by_key(|game| game.name.to_lowercase());
        Ok(games)
    })
    .await
}

/// Personal notes for a game, kept on this computer only.
#[tauri::command]
#[specta::specta]
pub async fn set_notes(app: AppHandle, app_id: AppId, notes: String) -> CommandResult<()> {
    Ok(app.state::<GameUserData>().set_notes(app_id, &notes)?)
}

/// Saves the user's genre, modes and vibe tags for a game (kept as edits on top of the Store's).
#[tauri::command]
#[specta::specta]
pub async fn set_game_classification(
    app: AppHandle,
    app_id: AppId,
    genre: Option<String>,
    modes: Vec<Mode>,
    tags: Vec<String>,
) -> CommandResult<()> {
    let handle = app.clone();
    with_library(app, move |library| {
        let base = base_classification(&handle, library, app_id)?;
        handle.state::<Tagging>().set_classification(
            app_id,
            Classification { genre, modes, tags },
            &base,
        )?;
        let _ = LibraryUpdated.emit(&handle);
        Ok(())
    })
    .await
}

/// What the game page's settings menu asks Steam to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum GameAction {
    Properties,
    Validate,
    Uninstall,
}

#[tauri::command]
#[specta::specta]
pub async fn game_action(app: AppHandle, app_id: AppId, action: GameAction) -> CommandResult<()> {
    let action = match action {
        GameAction::Properties => SteamAction::Properties,
        GameAction::Validate => SteamAction::Validate,
        GameAction::Uninstall => SteamAction::Uninstall,
    };
    request_steam(app, action, app_id).await
}

/// Ends the running game's processes (the UI asks for confirmation first).
#[tauri::command]
#[specta::specta]
pub async fn stop_game(app: AppHandle, app_id: AppId) -> CommandResult<()> {
    with_library(app, move |library| {
        let dir = library
            .install_dir(app_id)
            .ok_or(Error::UnknownGame(app_id))?;
        client::stop_game(&dir).map(drop)
    })
    .await
}

/// Opens the game's folder in the file explorer.
#[tauri::command]
#[specta::specta]
pub async fn browse_game_files(app: AppHandle, app_id: AppId) -> CommandResult<()> {
    let dir = app
        .state::<LibraryService>()
        .install_dir(app_id)
        .ok_or(Error::UnknownGame(app_id))?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(CommandError::other)
}

/// Steam web pages of a game, opened in the default browser until Vapor has its own webview.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SteamPage {
    Store,
    Guides,
    Discussions,
}

#[tauri::command]
#[specta::specta]
pub async fn open_steam_page(app: AppHandle, app_id: AppId, page: SteamPage) -> CommandResult<()> {
    let url = match page {
        SteamPage::Store => format!("https://store.steampowered.com/app/{app_id}/"),
        SteamPage::Guides => format!("https://steamcommunity.com/app/{app_id}/guides/"),
        SteamPage::Discussions => format!("https://steamcommunity.com/app/{app_id}/discussions/"),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(CommandError::other)
}

/// Opens a news post on Steam.
#[tauri::command]
#[specta::specta]
pub async fn open_news(app: AppHandle, app_id: AppId, gid: String) -> CommandResult<()> {
    let url = app
        .state::<NewsService>()
        .url(app_id, &gid)
        .ok_or(Error::UnknownGame(app_id))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(CommandError::other)
}

/// Opens a link from a news post in the default browser (`http` and `https` only).
#[tauri::command]
#[specta::specta]
pub async fn open_link(app: AppHandle, url: String) -> CommandResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(CommandError::other("only web links can be opened"));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(CommandError::other)
}
