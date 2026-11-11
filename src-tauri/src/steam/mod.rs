//! Read-only access to the local Steam install. Text files only (VDF/ACF); Steam's binary caches
//! are not read (see DECISIONS.md). Vapor never writes to Steam's files.

pub mod activity;
pub mod artwork;
pub mod client;
pub mod install;
pub mod libraries;
pub mod manifests;
pub mod non_games;
pub mod users;
mod vdf;

pub use install::SteamInstall;
