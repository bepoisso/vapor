//! Game art in `appcache/librarycache/<appid>/`. Files are often inside hash-named subfolders
//! and names vary (`library_capsule.jpg`, `logo_english.png`…), so each app folder is scanned
//! recursively and files are picked by pattern (`docs/STEAM_INTEGRATION.md` §4).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtPaths {
    /// 2:3 cover (600×900).
    pub cover: Option<PathBuf>,
    /// Wide banner (1920×620).
    pub hero: Option<PathBuf>,
    /// Transparent logo.
    pub logo: Option<PathBuf>,
}

/// Subfolders are one level deep in practice; two is a safe bound.
const MAX_DEPTH: usize = 2;

pub fn resolve(app_dir: &Path) -> ArtPaths {
    let mut files = Vec::new();
    collect_files(app_dir, MAX_DEPTH, &mut files);
    pick(&files)
}

fn collect_files(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        match entry.file_type() {
            Ok(kind) if kind.is_dir() && depth > 0 => collect_files(&path, depth - 1, out),
            Ok(kind) if kind.is_file() => out.push(path),
            _ => {}
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// First file matching the earliest pattern in `patterns`.
fn first_match(files: &[PathBuf], patterns: &[&dyn Fn(&str) -> bool]) -> Option<PathBuf> {
    patterns.iter().find_map(|matches| {
        files
            .iter()
            .filter(|path| matches(&file_name(path)))
            // Stable choice when several folders hold the same name.
            .min()
            .cloned()
    })
}

fn pick(files: &[PathBuf]) -> ArtPaths {
    let is_jpg = |name: &str| name.ends_with(".jpg") || name.ends_with(".jpeg");
    ArtPaths {
        cover: first_match(
            files,
            &[
                &|name| name.starts_with("library_600x900") && is_jpg(name),
                &|name| name.starts_with("library_capsule") && is_jpg(name),
            ],
        ),
        hero: first_match(
            files,
            &[&|name| name == "library_hero.jpg", &|name| {
                name.starts_with("library_hero") && !name.contains("blur") && is_jpg(name)
            }],
        ),
        logo: first_match(
            files,
            &[
                &|name| name == "logo.png",
                &|name| name == "logo_english.png",
                &|name| name.starts_with("logo_") && name.ends_with(".png"),
            ],
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(names: &[&str]) -> Vec<PathBuf> {
        names.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn picks_standard_names() {
        let art = pick(&paths(&[
            "x/04cb7aa0.jpg",
            "x/library_600x900.jpg",
            "x/library_hero.jpg",
            "x/library_hero_blur.jpg",
            "x/logo.png",
        ]));
        assert_eq!(art.cover, Some(PathBuf::from("x/library_600x900.jpg")));
        assert_eq!(art.hero, Some(PathBuf::from("x/library_hero.jpg")));
        assert_eq!(art.logo, Some(PathBuf::from("x/logo.png")));
    }

    #[test]
    fn falls_back_to_capsules_hashed_folders_and_localized_logos() {
        let art = pick(&paths(&[
            "x/b115/library_capsule.jpg",
            "x/96be/library_hero_blur.jpg",
            "x/96be/library_hero_2x.jpg",
            "x/0689/logo_french.png",
            "x/0690/logo_english.png",
        ]));
        assert_eq!(art.cover, Some(PathBuf::from("x/b115/library_capsule.jpg")));
        assert_eq!(art.hero, Some(PathBuf::from("x/96be/library_hero_2x.jpg")));
        assert_eq!(art.logo, Some(PathBuf::from("x/0690/logo_english.png")));
    }

    #[test]
    fn missing_art_stays_none() {
        assert_eq!(pick(&paths(&["x/header.jpg"])), ArtPaths::default());
    }
}
