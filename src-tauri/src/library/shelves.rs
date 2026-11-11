//! Smart shelves. Phase 1 serves the defaults; persistence and editing come in Phase 5.

use crate::model::{Condition, ConditionValue, Field, Op, Rule, RuleNode, SmartShelf};

fn includes(field: Field, value: &str) -> RuleNode {
    RuleNode::Condition(Condition {
        field,
        op: Op::Includes,
        value: ConditionValue::Text(value.to_owned()),
    })
}

fn shelf(id: &str, title: &str, order: u32, all: Vec<RuleNode>) -> SmartShelf {
    SmartShelf {
        id: id.to_owned(),
        title: title.to_owned(),
        rule: Rule {
            all,
            any: Vec::new(),
        },
        order,
        pinned: false,
    }
}

/// Shelves seeded on first run (`docs/LIBRARY_SPEC.md` §5).
pub fn defaults() -> Vec<SmartShelf> {
    vec![
        shelf(
            "demanding-indies",
            "Demanding indies",
            0,
            vec![
                includes(Field::Tags, "Indie"),
                includes(Field::Tags, "Hard"),
            ],
        ),
        shelf(
            "big-stories",
            "Big stories",
            1,
            vec![includes(Field::Tags, "Story")],
        ),
        shelf("online", "Online", 2, vec![includes(Field::Modes, "PvP")]),
    ]
}
