//! Vapor backend. Owns everything that touches the file system, Steam files, the network and
//! process launching. The frontend talks to it through typed Tauri commands only.

mod commands;
mod enrichment;
mod error;
mod game;
mod images;
mod library;
mod model;
mod protocol;
mod remote_images;
mod sessions;
mod settings;
mod startup;
mod steam;
mod web;

use std::sync::Arc;

use enrichment::service::EnrichmentService;
use game::achievements::AchievementsService;
use game::news::NewsService;
use game::social::{SocialService, SocialUpdated};
use game::user_data::GameUserData;
use library::service::{self as library_service, LibraryService, LibraryUpdated};
use library::shelves::ShelfStore;
use library::tags::Tagging;
use remote_images::RemoteImages;
use sessions::{GameSessions, RunningGameChanged};
use settings::SettingsStore;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;
use tauri_specta::{Builder, collect_commands, collect_events};
use web::HttpClient;

/// Generated TypeScript bindings, relative to `src-tauri/`. Committed; CI checks it is up to date.
#[cfg(any(debug_assertions, test))]
const BINDINGS_PATH: &str = "../src/lib/bindings.ts";

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        // One TypeScript type per Rust type (no `_Serialize`/`_Deserialize` split).
        .disable_serde_phases()
        .commands(collect_commands![
            commands::app_info,
            commands::browse_game_files,
            commands::delete_shelf,
            commands::game_action,
            commands::get_game,
            commands::get_game_achievements,
            commands::get_game_news,
            commands::get_game_social,
            commands::get_library,
            commands::get_profile,
            commands::get_running_game,
            commands::get_settings,
            commands::import_steam_collections,
            commands::install_game,
            commands::launch_game,
            commands::list_hidden_games,
            commands::list_shelves,
            commands::open_api_key_page,
            commands::open_link,
            commands::open_news,
            commands::open_steam_page,
            commands::remove_api_key,
            commands::reorder_shelves,
            commands::report_startup,
            commands::save_api_key,
            commands::save_shelf,
            commands::set_account,
            commands::set_favorite,
            commands::set_game_classification,
            commands::set_game_tags,
            commands::set_hidden,
            commands::set_notes,
            commands::set_steam_path,
            commands::set_store_enrichment,
            commands::stop_game,
        ])
        .events(collect_events![
            LibraryUpdated,
            RunningGameChanged,
            SocialUpdated
        ])
}

#[cfg(any(debug_assertions, test))]
fn export_bindings(builder: &Builder<tauri::Wry>) {
    builder
        .export(
            specta_typescript::Typescript::default().header("// @ts-nocheck\n/* eslint-disable */"),
            BINDINGS_PATH,
        )
        .expect("failed to export TypeScript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let process_start = startup::ProcessStart::now();
    let builder = specta_builder();
    let context = tauri::generate_context!();
    // Same folder as Tauri's `app_cache_dir`, resolved before the app starts so the library
    // (with its cached snapshot) exists before the webview's first command or image request.
    let identifier = &context.config().identifier;
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier);
    // Same folder as Tauri's `app_config_dir`.
    let config_dir = dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier);
    let settings = Arc::new(SettingsStore::load(&config_dir));
    // The sample library keeps its tag edits, favorites and notes apart from the real ones.
    let user_dir = if library_service::sample_requested() {
        config_dir.join("sample")
    } else {
        config_dir.clone()
    };

    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        // Registered first so that a second launch focuses the running window instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // The window always opens visible (dark background, content fades in); size and position
        // are restored, visibility is not.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        // Rust-side use only (opening Steam's API key page); no frontend permission is granted.
        .plugin(tauri_plugin_opener::init())
        .manage(process_start)
        .manage(LibraryService::new(cache_dir.clone(), settings.clone()))
        .manage(GameSessions::new(settings.clone()))
        .manage(EnrichmentService::new(cache_dir.clone()))
        .manage(AchievementsService::new(&cache_dir))
        .manage(NewsService::new(&cache_dir))
        .manage(SocialService::new(&cache_dir))
        .manage(RemoteImages::new(&cache_dir))
        .manage(HttpClient(web::client()))
        .manage(Tagging::load(&user_dir))
        .manage(GameUserData::load(&user_dir))
        .manage(ShelfStore::load(&config_dir))
        .manage(settings)
        .register_asynchronous_uri_scheme_protocol(images::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(protocol::handle(app, request).await);
            });
        })
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            LibraryService::start_background(app.handle().clone());
            GameSessions::watch_running_game(app.handle().clone());
            Ok(())
        })
        .run(context)
        .expect("error while running Vapor");
}

#[cfg(test)]
mod tests {
    /// Regenerates `src/lib/bindings.ts`. CI runs this and fails if the file changed.
    #[test]
    fn export_typescript_bindings() {
        super::export_bindings(&super::specta_builder());
    }
}
