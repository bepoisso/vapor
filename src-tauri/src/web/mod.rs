//! Network access: the official Steam Web API, the Steam CDN for missing art and, when the user
//! opts in, the Store's `appdetails` endpoint.

pub mod cdn;
pub mod steam_api;

use std::time::Duration;

use crate::error::Error;

const TIMEOUT: Duration = Duration::from_secs(15);

/// The shared HTTP client (managed Tauri state).
pub struct HttpClient(pub reqwest::Client);

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!(
            "Vapor/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/bepoisso/vapor)"
        ))
        .timeout(TIMEOUT)
        .build()
        .unwrap_or_default()
}

/// Request URLs can carry the API key: strip them from every error message.
pub fn network_error(error: reqwest::Error) -> Error {
    Error::Network(error.without_url().to_string())
}
