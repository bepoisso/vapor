//! `steamapps/libraryfolders.vdf`: one library folder per drive.

use std::path::{Path, PathBuf};

use keyvalues_parser::Obj;

use super::vdf;
use crate::error::Error;

pub fn read(file: &Path, steam_root: &Path) -> Result<Vec<PathBuf>, Error> {
    Ok(parse(&vdf::read_root(file)?, steam_root))
}

/// Library roots, Steam's own folder first, without duplicates.
pub fn parse(root: &Obj<'_>, steam_root: &Path) -> Vec<PathBuf> {
    let mut folders = vec![steam_root.to_owned()];
    for (_, entry) in vdf::children(root) {
        if let Some(path) = vdf::get_str(entry, "path").map(PathBuf::from)
            && !folders.iter().any(|known| same_path(known, &path))
        {
            folders.push(path);
        }
    }
    folders
}

/// Windows paths are case-insensitive and Steam mixes `/` and `\`.
fn same_path(a: &Path, b: &Path) -> bool {
    let normalize = |path: &Path| {
        path.to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase()
    };
    normalize(a) == normalize(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps"
		{
			"228980"		"0"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"apps"
		{
			"504230"		"1234"
		}
	}
}
"#;

    #[test]
    fn lists_library_roots_without_duplicating_steam() {
        let root = vdf::parse_root(FIXTURE);
        let folders = parse(&root, Path::new("c:/program files (x86)/steam"));
        assert_eq!(
            folders,
            vec![
                PathBuf::from("c:/program files (x86)/steam"),
                PathBuf::from(r"D:\SteamLibrary"),
            ]
        );
    }
}
