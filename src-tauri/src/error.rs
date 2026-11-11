//! Errors returned by Tauri commands. Serialized as a plain message for the frontend.

use serde::Serialize;
use specta::Type;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to read the sample library: {0}")]
    SampleData(#[from] serde_json::Error),
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
