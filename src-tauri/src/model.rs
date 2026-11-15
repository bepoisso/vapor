//! Data model shared with the frontend (TypeScript types are generated from these).
//! Shape: `docs/LIBRARY_SPEC.md` §0; rules and shelves: `docs/SMART_SHELVES_SPEC.md` §0. Unknown values are `null`, never guessed.

use serde::{Deserialize, Serialize};
use specta::Type;

pub type AppId = u32;

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Achievements {
    pub unlocked: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CloudStatus {
    Synced,
    Pending,
    Conflict,
    Unknown,
}

/// URLs served by the `vapor` protocol (see `images.rs`). `null` when the art does not exist.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GameImages {
    /// Cover thumbnail, sized for shelves.
    pub cover: Option<String>,
    /// Smaller cover thumbnail, for the dense library grid.
    pub cover_small: Option<String>,
    /// Full-size banner, for the hero.
    pub hero: Option<String>,
    /// Banner thumbnail, for wide cards.
    pub hero_small: Option<String>,
    /// Transparent logo; `null` too when it would be unreadable on a dark background.
    pub logo: Option<String>,
}

/// The Steam account whose library is shown.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub persona_name: Option<String>,
    pub avatar: Option<String>,
}

/// What a rule condition looks at (`docs/SMART_SHELVES_SPEC.md` §0).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Genre,
    Modes,
    Tags,
    /// Hours.
    Playtime,
    LastPlayed,
    Installed,
    AchievementsPct,
}

/// Comparison of the number, date and yes/no fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Op {
    Gt,
    Lt,
    OlderThanDays,
    Is,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum ConditionValue {
    Bool(bool),
    Number(f64),
}

/// Set fields (genre, modes, tags) pass when the game has ANY of `values`; the other fields use
/// `op` and `value`. A condition with nothing set is ignored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Condition {
    pub field: Field,
    #[serde(default)]
    pub values: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub op: Option<Op>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub value: Option<ConditionValue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Match {
    /// Every condition (AND).
    #[default]
    All,
    /// At least one condition (OR).
    Any,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct Rule {
    #[serde(rename = "match")]
    pub match_mode: Match,
    #[serde(default)]
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ShelfKind {
    /// Filled by a rule.
    Smart,
    /// Hand-picked games (Favorites).
    Manual,
    /// A Steam collection, read-only.
    Steam,
}

/// A row of the library: smart (rule), manual (Favorites) or imported from Steam.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: String,
    pub name: String,
    pub kind: ShelfKind,
    /// Smart shelves only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub rule: Option<Rule>,
    /// Manual and Steam shelves: filled in when listed (Favorites from the favorite toggles,
    /// Steam shelves from the collection). `null` when unknown (collection not found).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub app_ids: Option<Vec<AppId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub steam_collection_id: Option<String>,
    /// Shown on the library page.
    pub visible: bool,
    /// Pinned shelves come first, in their own order.
    pub pinned: bool,
    pub order: u32,
    /// Also a pill in "In the mood for…".
    #[serde(default)]
    pub show_as_mood: bool,
    #[serde(default)]
    pub hide_not_installed: bool,
    /// ISO 8601.
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    /// A default shelf the user hasn't edited: hidden in the library when nothing matches. The
    /// user's own shelves always show, so a new one never disappears before it can be edited.
    #[serde(default)]
    pub seeded: bool,
}
