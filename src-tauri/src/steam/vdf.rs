//! Helpers over `keyvalues-parser` for Steam's text VDF files. Steam treats keys
//! case-insensitively (`Software` vs `software`), so lookups here do too.

use std::path::Path;

use keyvalues_parser::{Obj, Parser, Value};

use crate::error::Error;

/// Reads and parses a VDF file, returning its root object.
///
/// Values are parsed with escapes (`\\` -> `\`) first; files that are not valid that way (stray
/// backslashes) are retried with backslashes taken literally.
pub fn read_root(path: &Path) -> Result<Obj<'static>, Error> {
    let text = std::fs::read_to_string(path).map_err(|source| Error::Io {
        path: path.to_owned(),
        source,
    })?;
    let parsed = match Parser::new().parse(&text) {
        Ok(parsed) => parsed,
        Err(_) => Parser::new()
            .literal_special_chars(true)
            .parse(&text)
            .map_err(|error| Error::Vdf {
                path: path.to_owned(),
                message: error.to_string(),
            })?,
    };
    match parsed.value.into_owned() {
        Value::Obj(obj) => Ok(obj),
        Value::Str(_) => Err(Error::Vdf {
            path: path.to_owned(),
            message: "root is not an object".to_owned(),
        }),
    }
}

/// First value for `key`, ignoring case.
pub fn get<'a>(obj: &'a Obj<'a>, key: &str) -> Option<&'a Value<'a>> {
    obj.iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
        .and_then(|(_, values)| values.first())
}

pub fn get_obj<'a>(obj: &'a Obj<'a>, key: &str) -> Option<&'a Obj<'a>> {
    get(obj, key).and_then(Value::get_obj)
}

pub fn get_str<'a>(obj: &'a Obj<'a>, key: &str) -> Option<&'a str> {
    get(obj, key).and_then(Value::get_str)
}

/// Follows nested object keys, e.g. `["Software", "Valve", "Steam", "apps"]`.
pub fn get_path<'a>(obj: &'a Obj<'a>, keys: &[&str]) -> Option<&'a Obj<'a>> {
    keys.iter()
        .try_fold(obj, |current, key| get_obj(current, key))
}

/// Parses a numeric string value; missing, empty or invalid values give `None`.
pub fn get_num<T: std::str::FromStr>(obj: &Obj<'_>, key: &str) -> Option<T> {
    get_str(obj, key).and_then(|value| value.trim().parse().ok())
}

/// Iterates `(key, object)` pairs of an object's object-valued children.
pub fn children<'a>(obj: &'a Obj<'a>) -> impl Iterator<Item = (&'a str, &'a Obj<'a>)> {
    obj.iter().filter_map(|(key, values)| {
        values
            .first()
            .and_then(Value::get_obj)
            .map(|child| (key.as_ref(), child))
    })
}

#[cfg(test)]
pub fn parse_root(text: &str) -> Obj<'static> {
    match keyvalues_parser::parse(text).unwrap().value.into_owned() {
        Value::Obj(obj) => obj,
        Value::Str(_) => panic!("root is not an object"),
    }
}
