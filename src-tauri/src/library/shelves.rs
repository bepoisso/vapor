//! Library shelves (`docs/SMART_SHELVES_SPEC.md`), saved in `<config dir>/shelves.json`: smart
//! shelves (a rule), the manual Favorites shelf, and Steam collections imported read-only. The
//! defaults are seeded on first run; files of the first format (smart shelves only, nested
//! `{ all, any }` rules) are migrated on load.
//!
//! Only shelf settings are stored here. The games of Favorites come from the favorite toggles
//! (`game::user_data`) and those of Steam shelves from the collections, filled in when listed.

use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::library::snapshot::iso8601_utc;
use crate::model::{Condition, Field, Match, Rule, Shelf, ShelfKind};
use crate::steam::collections::{FAVORITES_ID, SteamCollection};

const SHELVES_FILE: &str = "shelves.json";
const VERSION: u32 = 2;
/// The manual shelf behind the game page's favorite toggle.
pub const FAVORITES_SHELF_ID: &str = "favorites";

#[derive(Serialize, Deserialize)]
struct File {
    version: u32,
    shelves: Vec<Shelf>,
    /// Set by the migration: import the Steam collections (visible, as before) once known.
    #[serde(default)]
    import_collections: bool,
}

fn now() -> String {
    iso8601_utc(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default(),
    )
}

fn tags(values: &[&str]) -> Condition {
    Condition {
        field: Field::Tags,
        values: values.iter().map(|value| (*value).to_owned()).collect(),
        op: None,
        value: None,
    }
}

fn smart(id: &str, name: &str, conditions: Vec<Condition>) -> Shelf {
    Shelf {
        id: id.to_owned(),
        name: name.to_owned(),
        kind: ShelfKind::Smart,
        rule: Some(Rule {
            match_mode: Match::All,
            conditions,
        }),
        app_ids: None,
        steam_collection_id: None,
        visible: true,
        pinned: false,
        order: 0,
        show_as_mood: false,
        hide_not_installed: false,
        created_at: now(),
        updated_at: now(),
        seeded: true,
    }
}

fn favorites_shelf() -> Shelf {
    Shelf {
        id: FAVORITES_SHELF_ID.to_owned(),
        name: "Favorites".to_owned(),
        kind: ShelfKind::Manual,
        rule: None,
        app_ids: None,
        steam_collection_id: None,
        visible: true,
        pinned: false,
        order: 0,
        show_as_mood: false,
        hide_not_installed: false,
        created_at: now(),
        updated_at: now(),
        // Hidden while empty, like a default smart shelf.
        seeded: true,
    }
}

/// Shelves seeded on first run (`mockups/data/shelves.sample.json`, without its examples).
pub fn defaults() -> Vec<Shelf> {
    let mut demanding = smart(
        "demanding-indies",
        "Demanding indies",
        vec![tags(&["Indie"]), tags(&["Hard"])],
    );
    demanding.pinned = true;
    let mut online = smart("online", "Online", Vec::new());
    online.rule = Some(Rule {
        match_mode: Match::All,
        conditions: vec![Condition {
            field: Field::Modes,
            values: vec!["PvP".to_owned()],
            op: None,
            value: None,
        }],
    });
    numbered(vec![
        demanding,
        smart("big-stories", "Big stories", vec![tags(&["Story"])]),
        online,
        favorites_shelf(),
    ])
}

/// Orders are always 0..n so moves stay simple.
fn numbered(mut shelves: Vec<Shelf>) -> Vec<Shelf> {
    for (index, shelf) in shelves.iter_mut().enumerate() {
        shelf.order = u32::try_from(index).unwrap_or(u32::MAX);
    }
    shelves
}

pub struct ShelfStore {
    file: PathBuf,
    data: RwLock<(Vec<Shelf>, bool)>,
}

impl ShelfStore {
    /// Loads `shelves.json` (migrating the first format), or the defaults on first run.
    pub fn load(config_dir: &Path) -> Self {
        let file = config_dir.join(SHELVES_FILE);
        let (shelves, import) = match std::fs::read(&file) {
            Ok(bytes) => parse(&bytes).unwrap_or_else(|| (defaults(), false)),
            Err(_) => (defaults(), false),
        };
        let mut shelves = shelves;
        shelves.sort_by_key(|shelf| shelf.order);
        Self {
            file,
            data: RwLock::new((numbered(shelves), import)),
        }
    }

    pub fn list(&self) -> Vec<Shelf> {
        self.data
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .0
            .clone()
    }

    fn change(&self, edit: impl FnOnce(&mut Vec<Shelf>)) -> Result<Vec<Shelf>, Error> {
        let mut data = self.data.write().unwrap_or_else(PoisonError::into_inner);
        let mut next = data.0.clone();
        edit(&mut next);
        let next = numbered(next);
        self.write(&next, data.1)?;
        data.0 = next.clone();
        Ok(next)
    }

    fn write(&self, shelves: &[Shelf], import_collections: bool) -> Result<(), Error> {
        let io_error = |source| Error::Io {
            path: self.file.clone(),
            source,
        };
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir).map_err(io_error)?;
        }
        let file = File {
            version: VERSION,
            // Games of manual and Steam shelves are not stored: they come from elsewhere.
            shelves: shelves
                .iter()
                .cloned()
                .map(|mut shelf| {
                    shelf.app_ids = None;
                    shelf
                })
                .collect(),
            import_collections,
        };
        let partial = self.file.with_extension("json.tmp");
        std::fs::write(&partial, serde_json::to_vec_pretty(&file)?).map_err(io_error)?;
        std::fs::rename(&partial, &self.file).map_err(io_error)
    }

    /// Creates (empty `id`, appended at the end) or updates a shelf's settings.
    pub fn save(&self, mut shelf: Shelf) -> Result<Vec<Shelf>, Error> {
        let stamp = now();
        self.change(|shelves| {
            match shelves.iter_mut().find(|existing| existing.id == shelf.id) {
                Some(existing) if !shelf.id.is_empty() => {
                    // Renamed or new rule: no longer a default that hides when empty.
                    if existing.name != shelf.name || existing.rule != shelf.rule {
                        existing.seeded = false;
                    }
                    existing.name = shelf.name;
                    if existing.kind == ShelfKind::Smart {
                        existing.rule = shelf.rule;
                    }
                    existing.visible = shelf.visible;
                    existing.pinned = shelf.pinned;
                    existing.show_as_mood = shelf.show_as_mood;
                    existing.hide_not_installed = shelf.hide_not_installed;
                    existing.updated_at = stamp;
                }
                _ => {
                    // Only smart shelves are created by hand; the others come from elsewhere.
                    shelf.id = new_id(shelves);
                    shelf.kind = ShelfKind::Smart;
                    shelf.app_ids = None;
                    shelf.steam_collection_id = None;
                    shelf.rule.get_or_insert_with(Rule::default);
                    shelf.seeded = false;
                    shelf.created_at.clone_from(&stamp);
                    shelf.updated_at = stamp;
                    shelves.push(shelf);
                }
            }
        })
    }

    /// Favorites can be hidden, not deleted (the favorite toggle fills it).
    pub fn delete(&self, id: &str) -> Result<Vec<Shelf>, Error> {
        self.change(|shelves| {
            shelves.retain(|shelf| shelf.id != id || shelf.id == FAVORITES_SHELF_ID);
        })
    }

    /// Puts shelves in the order of `ids`; shelves not listed keep their relative order after.
    pub fn reorder(&self, ids: &[String]) -> Result<Vec<Shelf>, Error> {
        self.change(|shelves| {
            shelves.sort_by_key(|shelf| {
                ids.iter()
                    .position(|id| *id == shelf.id)
                    .unwrap_or(usize::MAX)
            });
        })
    }

    /// Adds a Steam shelf for each collection not imported yet (Favorites excepted: it feeds the
    /// manual Favorites shelf). New ones are hidden, so importing never clutters the library.
    pub fn import_collections(&self, collections: &[SteamCollection]) -> Result<Vec<Shelf>, Error> {
        self.import(collections, false)
    }

    /// After a migration from the first format: import the collections the library used to show,
    /// visible, once they are known. Returns whether anything changed.
    pub fn finish_migration(&self, collections: &[SteamCollection]) -> Result<bool, Error> {
        let pending = self.data.read().unwrap_or_else(PoisonError::into_inner).1;
        if !pending || collections.is_empty() {
            return Ok(false);
        }
        self.import(collections, true)?;
        let mut data = self.data.write().unwrap_or_else(PoisonError::into_inner);
        data.1 = false;
        self.write(&data.0, false)?;
        Ok(true)
    }

    fn import(&self, collections: &[SteamCollection], visible: bool) -> Result<Vec<Shelf>, Error> {
        let stamp = now();
        self.change(|shelves| {
            for collection in collections {
                let known = shelves.iter().any(|shelf| {
                    shelf.steam_collection_id.as_deref() == Some(collection.id.as_str())
                });
                if collection.id == FAVORITES_ID || known {
                    continue;
                }
                shelves.push(Shelf {
                    id: format!("steam-{}", collection.id),
                    name: collection.name.clone(),
                    kind: ShelfKind::Steam,
                    rule: None,
                    app_ids: None,
                    steam_collection_id: Some(collection.id.clone()),
                    visible,
                    pinned: false,
                    order: 0,
                    show_as_mood: false,
                    hide_not_installed: false,
                    created_at: stamp.clone(),
                    updated_at: stamp.clone(),
                    seeded: false,
                });
            }
        })
    }
}

fn new_id(shelves: &[Shelf]) -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let mut id = format!("shelf-{stamp}");
    let mut suffix = 1;
    while shelves.iter().any(|shelf| shelf.id == id) {
        id = format!("shelf-{stamp}-{suffix}");
        suffix += 1;
    }
    id
}

/// The current format, or the first one (migrated). `None` when unreadable.
fn parse(bytes: &[u8]) -> Option<(Vec<Shelf>, bool)> {
    if let Ok(file) = serde_json::from_slice::<File>(bytes)
        && file.version == VERSION
    {
        return Some((file.shelves, file.import_collections));
    }
    let old: Vec<legacy::Shelf> = serde_json::from_slice(bytes).ok()?;
    Some((migrate(old), true))
}

/// First format → current: rules converted, Favorites added after the user's shelves.
fn migrate(old: Vec<legacy::Shelf>) -> Vec<Shelf> {
    let stamp = now();
    let mut shelves: Vec<Shelf> = old
        .into_iter()
        .map(|shelf| Shelf {
            id: shelf.id,
            name: shelf.title,
            kind: ShelfKind::Smart,
            rule: Some(legacy::convert(&shelf.rule)),
            app_ids: None,
            steam_collection_id: None,
            visible: true,
            pinned: shelf.pinned,
            order: shelf.order,
            show_as_mood: false,
            hide_not_installed: false,
            created_at: stamp.clone(),
            updated_at: stamp.clone(),
            seeded: shelf.seeded,
        })
        .collect();
    shelves.sort_by_key(|shelf| shelf.order);
    shelves.push(favorites_shelf());
    numbered(shelves)
}

/// The first `shelves.json` format: smart shelves with nested `{ all, any }` rules.
mod legacy {
    use serde::Deserialize;

    use crate::model::{Condition, ConditionValue, Field, Match, Op, Rule as NewRule};

    #[derive(Deserialize)]
    pub struct Shelf {
        pub id: String,
        pub title: String,
        #[serde(default)]
        pub rule: Rule,
        #[serde(default)]
        pub order: u32,
        #[serde(default)]
        pub pinned: bool,
        #[serde(default)]
        pub seeded: bool,
    }

    #[derive(Default, Deserialize)]
    pub struct Rule {
        #[serde(default)]
        all: Vec<Node>,
        #[serde(default)]
        any: Vec<Node>,
    }

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Node {
        Condition(OldCondition),
        Group(Rule),
    }

    #[derive(Deserialize)]
    struct OldCondition {
        field: String,
        op: String,
        value: serde_json::Value,
    }

    /// One condition per node: a single test, or an OR group over one field ("Platformer or
    /// RPG", what the first editor and "Save as shelf" produced). Other shapes are dropped.
    pub fn convert(rule: &Rule) -> NewRule {
        let (match_mode, nodes) = if rule.all.is_empty() && !rule.any.is_empty() {
            (Match::Any, &rule.any)
        } else {
            (Match::All, &rule.all)
        };
        NewRule {
            match_mode,
            conditions: nodes.iter().filter_map(node).collect(),
        }
    }

    fn node(node: &Node) -> Option<Condition> {
        match node {
            Node::Condition(old) => condition(old),
            Node::Group(group) if group.all.is_empty() => {
                let parts: Vec<Condition> = group
                    .any
                    .iter()
                    .map(|part| match part {
                        Node::Condition(old) => condition(old),
                        Node::Group(_) => None,
                    })
                    .collect::<Option<_>>()?;
                let first = parts.first()?;
                if !set_field(first.field) || parts.iter().any(|part| part.field != first.field) {
                    return None;
                }
                Some(Condition {
                    field: first.field,
                    values: parts.iter().flat_map(|part| part.values.clone()).collect(),
                    op: None,
                    value: None,
                })
            }
            Node::Group(_) => None,
        }
    }

    fn set_field(field: Field) -> bool {
        matches!(field, Field::Genre | Field::Modes | Field::Tags)
    }

    fn condition(old: &OldCondition) -> Option<Condition> {
        let number = || old.value.as_f64();
        let op = match old.op.as_str() {
            "gt" => Some(Op::Gt),
            "lt" => Some(Op::Lt),
            "olderThanDays" => Some(Op::OlderThanDays),
            _ => None,
        };
        let numeric = |field: Field, value: f64| Condition {
            field,
            values: Vec::new(),
            op,
            value: Some(ConditionValue::Number(value)),
        };
        match old.field.as_str() {
            field @ ("genre" | "modes" | "tags") => Some(Condition {
                field: match field {
                    "genre" => Field::Genre,
                    "modes" => Field::Modes,
                    _ => Field::Tags,
                },
                values: vec![old.value.as_str()?.to_owned()],
                op: None,
                value: None,
            }),
            "installed" => Some(Condition {
                field: Field::Installed,
                values: Vec::new(),
                op: Some(Op::Is),
                value: Some(ConditionValue::Bool(old.value.as_bool()?)),
            }),
            // Minutes then, hours now.
            "playtimeMinutes" => Some(numeric(Field::Playtime, number()? / 60.0)),
            "lastPlayed" => Some(numeric(Field::LastPlayed, number()?)),
            "achievementsPct" => Some(numeric(Field::AchievementsPct, number()?)),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ConditionValue, Op};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vapor-shelves-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn user_shelf(name: &str) -> Shelf {
        let mut shelf = smart("", name, vec![tags(&["Chill"])]);
        shelf.seeded = false;
        shelf
    }

    fn collection(id: &str, name: &str) -> SteamCollection {
        SteamCollection {
            id: id.into(),
            name: name.into(),
            app_ids: vec![620],
        }
    }

    #[test]
    fn seeds_the_defaults_on_first_run() {
        let dir = temp_dir("seed");
        let store = ShelfStore::load(&dir);
        let shelves = store.list();
        let ids: Vec<&str> = shelves.iter().map(|shelf| shelf.id.as_str()).collect();
        assert_eq!(
            ids,
            ["demanding-indies", "big-stories", "online", "favorites"]
        );
        assert!(shelves[0].pinned);
        assert_eq!(shelves[3].kind, ShelfKind::Manual);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_edits_reorders_and_deletes() {
        let dir = temp_dir("edit");
        let store = ShelfStore::load(&dir);
        let shelves = store.save(user_shelf("Cozy")).unwrap();
        let cozy = shelves.last().unwrap().clone();
        assert!(cozy.id.starts_with("shelf-"));
        assert_eq!(cozy.order, 4);
        assert!(!cozy.created_at.is_empty());

        let mut renamed = cozy.clone();
        renamed.name = "Cozy nights".into();
        renamed.visible = false;
        renamed.show_as_mood = true;
        let shelves = store.save(renamed).unwrap();
        assert_eq!(shelves.len(), 5);
        assert_eq!(shelves[4].name, "Cozy nights");
        assert!(!shelves[4].visible && shelves[4].show_as_mood);

        let shelves = store.reorder(&[cozy.id.clone(), "online".into()]).unwrap();
        let ids: Vec<&str> = shelves.iter().map(|shelf| shelf.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                cozy.id.as_str(),
                "online",
                "demanding-indies",
                "big-stories",
                "favorites"
            ]
        );

        // Persisted across loads.
        assert_eq!(ShelfStore::load(&dir).list()[0].name, "Cozy nights");

        assert_eq!(store.delete(&cozy.id).unwrap().len(), 4);
        // Favorites stays.
        assert_eq!(store.delete(FAVORITES_SHELF_ID).unwrap().len(), 4);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn editing_a_default_makes_it_a_user_shelf_but_hiding_it_does_not() {
        let dir = temp_dir("unseed");
        let store = ShelfStore::load(&dir);
        let mut online = store.list()[2].clone();
        online.visible = false;
        assert!(store.save(online.clone()).unwrap()[2].seeded);
        online.name = "Online with friends".into();
        assert!(!store.save(online).unwrap()[2].seeded);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn imports_steam_collections_once_and_hidden() {
        let dir = temp_dir("import");
        let store = ShelfStore::load(&dir);
        let collections = [
            collection("favorite", "Favoris"),
            collection("uc-1", "Valve"),
        ];
        let shelves = store.import_collections(&collections).unwrap();
        assert_eq!(shelves.len(), 5);
        let valve = &shelves[4];
        assert_eq!(valve.kind, ShelfKind::Steam);
        assert_eq!(valve.steam_collection_id.as_deref(), Some("uc-1"));
        assert!(!valve.visible);
        assert_eq!(store.import_collections(&collections).unwrap().len(), 5);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn migrates_the_first_format() {
        let dir = temp_dir("migrate");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join(SHELVES_FILE),
            r#"[
              {"id":"demanding-indies","title":"Demanding indies","order":0,"pinned":false,"seeded":true,
               "rule":{"all":[{"field":"tags","op":"includes","value":"Indie"},{"field":"tags","op":"includes","value":"Hard"}]}},
              {"id":"shelf-1","title":"Long coop","order":1,"pinned":true,"seeded":false,
               "rule":{"all":[{"any":[{"field":"genre","op":"includes","value":"Platformer"},{"field":"genre","op":"includes","value":"RPG"}]},
                              {"field":"playtimeMinutes","op":"gt","value":600},
                              {"field":"installed","op":"eq","value":true}]}},
              {"id":"shelf-2","title":"Either","order":2,"pinned":false,
               "rule":{"any":[{"field":"modes","op":"includes","value":"Coop"},{"field":"lastPlayed","op":"olderThanDays","value":90}]}}
            ]"#,
        )
        .unwrap();
        let store = ShelfStore::load(&dir);
        let shelves = store.list();
        assert_eq!(shelves.len(), 4);
        assert!(shelves[0].seeded);

        let long = shelves[1].rule.as_ref().unwrap();
        assert_eq!(long.match_mode, Match::All);
        assert_eq!(long.conditions[0].field, Field::Genre);
        assert_eq!(long.conditions[0].values, ["Platformer", "RPG"]);
        assert_eq!(long.conditions[1].field, Field::Playtime);
        assert_eq!(long.conditions[1].value, Some(ConditionValue::Number(10.0)));
        assert_eq!(long.conditions[2].op, Some(Op::Is));
        assert!(shelves[1].pinned);

        let either = shelves[2].rule.as_ref().unwrap();
        assert_eq!(either.match_mode, Match::Any);
        assert_eq!(either.conditions[1].op, Some(Op::OlderThanDays));
        assert_eq!(shelves[3].id, FAVORITES_SHELF_ID);

        // The collections the library showed come back, visible, once known.
        assert!(
            store
                .finish_migration(&[collection("uc-1", "Valve")])
                .unwrap()
        );
        let shelves = store.list();
        assert!(shelves[4].visible);
        assert!(
            !ShelfStore::load(&dir)
                .finish_migration(&[collection("uc-2", "More")])
                .unwrap()
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
