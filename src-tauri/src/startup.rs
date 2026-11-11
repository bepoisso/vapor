//! Startup timing. Set `VAPOR_TRACE_STARTUP=<file>` to append one JSON line per launch with the
//! time spent in each startup stage (`pnpm perf:startup` runs it several times).

use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;

const TRACE_ENV: &str = "VAPOR_TRACE_STARTUP";

/// Wall-clock time at which the Rust entry point started.
pub struct ProcessStart(pub f64);

impl ProcessStart {
    pub fn now() -> Self {
        Self(epoch_ms(SystemTime::now()))
    }
}

fn epoch_ms(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or_default()
}

/// Marks measured by the frontend, in ms relative to `navigation_start` (`performance.timeOrigin`).
#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FrontendMarks {
    pub navigation_start: f64,
    pub script_start: f64,
    /// `get_library`, `list_shelves` and `get_profile` resolved.
    pub library_loaded: f64,
    /// The page committed a render with the data.
    pub data_ready: f64,
    pub font_ready: f64,
    /// The content was revealed and a frame painted.
    pub content_shown: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Trace {
    process_to_navigation: f64,
    navigation_to_script: f64,
    script_to_library: f64,
    library_to_render: f64,
    render_to_font: f64,
    font_to_content: f64,
    /// Process start to the library painted.
    total: f64,
}

/// Appends the trace to the file named by `VAPOR_TRACE_STARTUP`, if set. Never fails the app.
pub fn record(process_start: &ProcessStart, marks: &FrontendMarks) {
    let Some(path) = std::env::var_os(TRACE_ENV) else {
        return;
    };
    let process_to_navigation = marks.navigation_start - process_start.0;
    let trace = Trace {
        process_to_navigation,
        navigation_to_script: marks.script_start,
        script_to_library: marks.library_loaded - marks.script_start,
        library_to_render: marks.data_ready - marks.library_loaded,
        render_to_font: marks.font_ready - marks.data_ready,
        font_to_content: marks.content_shown - marks.font_ready,
        total: process_to_navigation + marks.content_shown,
    };
    let Ok(line) = serde_json::to_string(&trace) else {
        return;
    };
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{line}");
    }
}
