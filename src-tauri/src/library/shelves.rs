//! Smart shelves: rule-based rows on the Library page, saved in `<config dir>/shelves.json`.
//! The defaults are seeded on first run; the user can then create, edit, reorder and delete.

use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::Error;
use crate::model::{Condition, ConditionValue, Field, Op, Rule, RuleNode, SmartShelf};

const SHELVES_FILE: &str = "shelves.json";

fn includes(field: Field, value: &str) -> RuleNode {
    RuleNode::Condition(Condition {
        field,
        op: Op::Includes,
        value: ConditionValue::Text(value.to_owned()),
    })
}

fn seeded(id: &str, title: &str, order: u32, all: Vec<RuleNode>) -> SmartShelf {
    SmartShelf {
        id: id.to_owned(),
        title: title.to_owned(),
        rule: Rule {
            all,
            any: Vec::new(),
        },
        order,
        pinned: false,
        seeded: true,
    }
}

/// Shelves seeded on first run (`docs/LIBRARY_SPEC.md` §5).
pub fn defaults() -> Vec<SmartShelf> {
    vec![
        seeded(
            "demanding-indies",
            "Demanding indies",
            0,
            vec![
                includes(Field::Tags, "Indie"),
                includes(Field::Tags, "Hard"),
            ],
        ),
        seeded(
            "big-stories",
            "Big stories",
            1,
            vec![includes(Field::Tags, "Story")],
        ),
        seeded("online", "Online", 2, vec![includes(Field::Modes, "PvP")]),
    ]
}

pub struct ShelfStore {
    file: PathBuf,
    shelves: RwLock<Vec<SmartShelf>>,
}

impl ShelfStore {
    /// Loads `shelves.json`, or the defaults when it does not exist yet (or is unreadable).
    pub fn load(config_dir: &Path) -> Self {
        let file = config_dir.join(SHELVES_FILE);
        let shelves = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(defaults);
        Self {
            file,
            shelves: RwLock::new(sorted(shelves)),
        }
    }

    pub fn list(&self) -> Vec<SmartShelf> {
        self.shelves
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn change(&self, edit: impl FnOnce(&mut Vec<SmartShelf>)) -> Result<Vec<SmartShelf>, Error> {
        let mut shelves = self.shelves.write().unwrap_or_else(PoisonError::into_inner);
        let mut next = shelves.clone();
        edit(&mut next);
        // Orders are always 0..n so moves stay simple.
        for (index, shelf) in next.iter_mut().enumerate() {
            shelf.order = u32::try_from(index).unwrap_or(u32::MAX);
        }
        let io_error = |source| Error::Io {
            path: self.file.clone(),
            source,
        };
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir).map_err(io_error)?;
        }
        std::fs::write(&self.file, serde_json::to_vec_pretty(&next)?).map_err(io_error)?;
        *shelves = next.clone();
        Ok(next)
    }

    /// Creates (empty `id`, appended at the end) or updates a shelf.
    pub fn save(&self, mut shelf: SmartShelf) -> Result<Vec<SmartShelf>, Error> {
        self.change(|shelves| {
            match shelves.iter_mut().find(|existing| existing.id == shelf.id) {
                Some(existing) if !shelf.id.is_empty() => {
                    existing.title = shelf.title;
                    existing.rule = shelf.rule;
                    existing.pinned = shelf.pinned;
                    // Edited by the user: no longer a default that hides when empty.
                    existing.seeded = false;
                }
                _ => {
                    shelf.id = new_id(shelves);
                    shelf.seeded = false;
                    shelves.push(shelf);
                }
            }
        })
    }

    pub fn delete(&self, id: &str) -> Result<Vec<SmartShelf>, Error> {
        self.change(|shelves| shelves.retain(|shelf| shelf.id != id))
    }

    /// Puts shelves in the order of `ids`; shelves not listed keep their relative order after.
    pub fn reorder(&self, ids: &[String]) -> Result<Vec<SmartShelf>, Error> {
        self.change(|shelves| {
            shelves.sort_by_key(|shelf| {
                ids.iter()
                    .position(|id| *id == shelf.id)
                    .unwrap_or(usize::MAX)
            });
        })
    }
}

fn sorted(mut shelves: Vec<SmartShelf>) -> Vec<SmartShelf> {
    shelves.sort_by_key(|shelf| shelf.order);
    shelves
}

fn new_id(shelves: &[SmartShelf]) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> (ShelfStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!("vapor-shelves-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        (ShelfStore::load(&dir), dir)
    }

    fn user_shelf(title: &str) -> SmartShelf {
        SmartShelf {
            id: String::new(),
            title: title.to_owned(),
            rule: Rule {
                all: vec![includes(Field::Tags, "Chill")],
                any: Vec::new(),
            },
            order: 0,
            pinned: false,
            seeded: false,
        }
    }

    #[test]
    fn seeds_the_defaults_on_first_run() {
        let (store, dir) = temp_store("seed");
        let ids: Vec<String> = store.list().into_iter().map(|shelf| shelf.id).collect();
        assert_eq!(ids, ["demanding-indies", "big-stories", "online"]);
        assert!(store.list().iter().all(|shelf| shelf.seeded));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_edits_reorders_and_deletes() {
        let (store, dir) = temp_store("edit");
        let shelves = store.save(user_shelf("Cozy")).unwrap();
        let cozy = shelves.last().unwrap().clone();
        assert!(cozy.id.starts_with("shelf-"));
        assert_eq!(cozy.order, 3);

        let mut renamed = cozy.clone();
        renamed.title = "Cozy nights".into();
        let shelves = store.save(renamed).unwrap();
        assert_eq!(shelves.len(), 4);
        assert_eq!(shelves[3].title, "Cozy nights");

        let shelves = store.reorder(&[cozy.id.clone(), "online".into()]).unwrap();
        let ids: Vec<&str> = shelves.iter().map(|shelf| shelf.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                cozy.id.as_str(),
                "online",
                "demanding-indies",
                "big-stories"
            ]
        );
        assert_eq!(
            shelves.iter().map(|s| s.order).collect::<Vec<_>>(),
            [0, 1, 2, 3]
        );

        // Persisted across loads.
        let reloaded = ShelfStore::load(&dir);
        assert_eq!(reloaded.list()[0].title, "Cozy nights");

        let shelves = store.delete(&cozy.id).unwrap();
        assert_eq!(shelves.len(), 3);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn editing_a_default_makes_it_a_user_shelf() {
        let (store, dir) = temp_store("unseed");
        let mut online = store.list()[2].clone();
        online.title = "Online with friends".into();
        let shelves = store.save(online).unwrap();
        assert!(!shelves[2].seeded);
        let _ = std::fs::remove_dir_all(dir);
    }
}
