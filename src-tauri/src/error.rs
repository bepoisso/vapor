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

/// What the frontend receives when a command fails.
#[derive(Debug, Serialize, Type)]
pub struct CommandError {
    pub message: String,
}

impl From<Error> for CommandError {
    fn from(error: Error) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
