//! Errors returned by Tauri commands. Serialized as a plain message for the frontend.

use std::path::PathBuf;

use serde::Serialize;
use specta::Type;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to read the sample library: {0}")]
    SampleData(#[from] serde_json::Error),

    #[error("Steam installation not found")]
    SteamNotFound,

    #[error("failed to read {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to parse {path}: {message}")]
    Vdf { path: PathBuf, message: String },

    #[error("failed to process image {path}: {message}")]
    Image { path: PathBuf, message: String },

    /// Never includes URLs: they can carry the API key.
    #[error("network error: {0}")]
    Network(String),

    #[error("Steam rejected the Web API key")]
    InvalidApiKey,

    #[error("a Steam Web API key is 32 hexadecimal characters")]
    MalformedApiKey,

    #[error("couldn't access the system keychain: {0}")]
    Keychain(String),

    #[error("{0} is not a Steam folder")]
    NotASteamFolder(PathBuf),
}

/// What kind of failure, so the UI can offer the right way out (e.g. "Open Settings").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    SteamNotFound,
    InvalidApiKey,
    Network,
    Other,
}

/// What the frontend receives when a command fails.
#[derive(Debug, Serialize, Type)]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
}

impl CommandError {
    pub fn other(error: impl std::fmt::Display) -> Self {
        Self {
            kind: ErrorKind::Other,
            message: error.to_string(),
        }
    }
}

impl From<Error> for CommandError {
    fn from(error: Error) -> Self {
        let kind = match error {
            Error::SteamNotFound | Error::NotASteamFolder(_) => ErrorKind::SteamNotFound,
            Error::InvalidApiKey | Error::MalformedApiKey => ErrorKind::InvalidApiKey,
            Error::Network(_) => ErrorKind::Network,
            _ => ErrorKind::Other,
        };
        Self {
            kind,
            message: error.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
