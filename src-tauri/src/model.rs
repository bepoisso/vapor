//! Data model shared with the frontend (TypeScript types are generated from these).
//! Shape: `docs/LIBRARY_SPEC.md` §0. Unknown values are `null`, never guessed.

use serde::{Deserialize, Serialize};
use specta::Type;

pub type AppId = u32;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub app_id: AppId,
    pub name: String,
    /// Primary genre. `null` until known (Store API enrichment, Phase 4).
    pub genre: Option<String>,
    pub modes: Vec<Mode>,
    /// Vibe tags: Indie, Hard, Story, Chill, Action, Competitive, Exploration, Short sessions…
    pub tags: Vec<String>,
    pub installed: Option<bool>,
    pub playtime_minutes: Option<u32>,
    /// ISO 8601 date or date-time.
    pub last_played: Option<String>,
    pub achievements: Option<Achievements>,
    pub cloud: Option<CloudStatus>,
    pub update_pending: Option<bool>,
    pub images: GameImages,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum Mode {
    Solo,
    Coop,
    PvP,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct Achievements {
    pub unlocked: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CloudStatus {
    Synced,
    Pending,
    Conflict,
    Unknown,
}

/// URLs served by the `vapor` protocol (see `images.rs`). `null` when the art does not exist.
#[derive(Debug, Clone, Default, Serialize, Type)]
pub struct GameImages {
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Genre,
    Modes,
    Tags,
    Installed,
    PlaytimeMinutes,
    LastPlayed,
    AchievementsPct,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Op {
    Includes,
    Eq,
    Lt,
    Gt,
    OlderThanDays,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum ConditionValue {
    Bool(bool),
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Condition {
    pub field: Field,
    pub op: Op,
    pub value: ConditionValue,
}

/// `all` = AND, `any` = OR; both may be set. Groups can nest, so a facet selection like
/// (Platformer OR RPG) AND (Coop) is expressible. Deviation from the spec, see DECISIONS.md.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct Rule {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[specta(optional)]
    pub all: Vec<RuleNode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[specta(optional)]
    pub any: Vec<RuleNode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum RuleNode {
    Condition(Condition),
    Group(Rule),
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartShelf {
    pub id: String,
    pub title: String,
    pub rule: Rule,
    pub order: u32,
    pub pinned: bool,
}
