//! Art for games Steam has no local copy of (owned but never installed or opened), downloaded
//! from the public Steam CDN once and cached on disk. Newer titles use hashed CDN paths and 404
//! here; such misses are remembered for a week so they are not requested on every view.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use reqwest::{Client, StatusCode};

use super::network_error;
use crate::error::Error;
use crate::images::ImageKind;
use crate::model::AppId;

const CDN_URL: &str = "https://cdn.cloudflare.steamstatic.com/steam/apps";
const MISS_TTL: Duration = Duration::from_secs(7 * 24 * 3600);

fn file_name(kind: ImageKind) -> &'static str {
    match kind {
        ImageKind::Cover => "library_600x900.jpg",
        ImageKind::Hero | ImageKind::HeroSmall => "library_hero.jpg",
        ImageKind::Logo => "logo.png",
    }
}

/// Where the downloaded file is (or would be) cached.
pub fn cached_path(dir: &Path, app_id: AppId, kind: ImageKind) -> PathBuf {
    dir.join(format!("{app_id}-{}", file_name(kind)))
}

fn miss_marker(path: &Path) -> PathBuf {
    path.with_extension("missing")
}

fn recent(path: &Path, ttl: Duration) -> bool {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < ttl)
}

/// The cached file, downloading it first if needed. `None` when the CDN has no such file.
pub async fn fetch(
    client: &Client,
    dir: &Path,
    app_id: AppId,
    kind: ImageKind,
) -> Result<Option<PathBuf>, Error> {
    let path = cached_path(dir, app_id, kind);
    if path.is_file() {
        return Ok(Some(path));
    }
    if recent(&miss_marker(&path), MISS_TTL) {
        return Ok(None);
    }

    let response = client
        .get(format!("{CDN_URL}/{app_id}/{}", file_name(kind)))
        .send()
        .await
        .map_err(network_error)?;
    let io_error = |source| Error::Io {
        path: path.clone(),
        source,
    };
    std::fs::create_dir_all(dir).map_err(io_error)?;
    if response.status() == StatusCode::NOT_FOUND {
        std::fs::write(miss_marker(&path), b"").map_err(io_error)?;
        return Ok(None);
    }
    let bytes = response
        .error_for_status()
        .map_err(network_error)?
        .bytes()
        .await
        .map_err(network_error)?;
    let partial = path.with_extension("part");
    std::fs::write(&partial, &bytes).map_err(io_error)?;
    std::fs::rename(&partial, &path).map_err(io_error)?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_cached_files_per_app_and_kind() {
        let dir = Path::new("cache");
        assert_eq!(
            cached_path(dir, 620, ImageKind::Cover),
            Path::new("cache/620-library_600x900.jpg")
        );
        // The small banner is a thumbnail of the same download.
        assert_eq!(
            cached_path(dir, 620, ImageKind::HeroSmall),
            cached_path(dir, 620, ImageKind::Hero)
        );
    }
}
