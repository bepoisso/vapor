//! Game art served to the webview through the `vapor` URI scheme, so the frontend never sees
//! file paths. URL shape: `vapor://localhost/img/<appid>/<kind>`, which WebView2 on Windows
//! exposes as `http://vapor.localhost/img/<appid>/<kind>`.

use std::path::PathBuf;

use tauri::http::{HeaderValue, Request, Response, StatusCode, header};

use crate::model::AppId;

pub const SCHEME: &str = "vapor";

#[cfg(windows)]
const BASE_URL: &str = "http://vapor.localhost";
#[cfg(not(windows))]
const BASE_URL: &str = "vapor://localhost";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Cover,
    Hero,
    Logo,
}

impl ImageKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Cover => "cover",
            Self::Hero => "hero",
            Self::Logo => "logo",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "cover" => Some(Self::Cover),
            "hero" => Some(Self::Hero),
            "logo" => Some(Self::Logo),
            _ => None,
        }
    }

    fn content_type(self) -> &'static str {
        match self {
            Self::Cover | Self::Hero => "image/jpeg",
            Self::Logo => "image/png",
        }
    }
}

pub fn image_url(app_id: AppId, kind: ImageKind) -> String {
    format!("{BASE_URL}/img/{app_id}/{}", kind.as_str())
}

/// Resolves image files on disk.
///
/// Phase 1 reads the reference mockup's local art folder (dev machines only; it is git-ignored).
/// Phase 2 replaces it with paths resolved from Steam's `appcache/librarycache`.
pub struct ImageStore {
    sample_dir: PathBuf,
}

impl ImageStore {
    pub fn sample() -> Self {
        Self {
            sample_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../mockups/assets"),
        }
    }

    pub fn path(&self, app_id: AppId, kind: ImageKind) -> PathBuf {
        let file = match kind {
            ImageKind::Cover => format!("{app_id}_library_600x900.jpg"),
            ImageKind::Hero => format!("{app_id}_library_hero.jpg"),
            ImageKind::Logo => format!("{app_id}_logo.png"),
        };
        self.sample_dir.join(file)
    }

    /// URL for the image if the file exists, `None` otherwise.
    pub fn url_if_exists(&self, app_id: AppId, kind: ImageKind) -> Option<String> {
        self.path(app_id, kind)
            .is_file()
            .then(|| image_url(app_id, kind))
    }
}

/// Parses `/img/<appid>/<kind>`.
fn parse_path(path: &str) -> Option<(AppId, ImageKind)> {
    let mut parts = path.trim_start_matches('/').split('/');
    let (Some("img"), Some(app_id), Some(kind), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return None;
    };
    Some((app_id.parse().ok()?, ImageKind::parse(kind)?))
}

fn response(
    status: StatusCode,
    content_type: Option<&'static str>,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    if let Some(content_type) = content_type {
        let headers = response.headers_mut();
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        // Art for a given app rarely changes; the webview may reuse it for the session.
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("max-age=86400"),
        );
    }
    response
}

/// Handles one `vapor://` request. Blocking (file I/O): call it off the main thread.
pub fn handle(store: &ImageStore, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some((app_id, kind)) = parse_path(request.uri().path()) else {
        return response(StatusCode::BAD_REQUEST, None, Vec::new());
    };
    match std::fs::read(store.path(app_id, kind)) {
        Ok(bytes) => response(StatusCode::OK, Some(kind.content_type()), bytes),
        Err(_) => response(StatusCode::NOT_FOUND, None, Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_image_paths() {
        assert_eq!(
            parse_path("/img/504230/cover"),
            Some((504230, ImageKind::Cover))
        );
        assert_eq!(parse_path("/img/730/logo"), Some((730, ImageKind::Logo)));
    }

    #[test]
    fn rejects_malformed_paths() {
        for path in [
            "/",
            "/img/504230",
            "/img/abc/cover",
            "/img/1/poster",
            "/img/1/cover/x",
            "/other/1/cover",
        ] {
            assert_eq!(parse_path(path), None, "{path}");
        }
    }

    #[test]
    fn builds_urls_the_handler_understands() {
        let url = image_url(504230, ImageKind::Hero);
        let (_, path) = url.split_once("localhost").unwrap();
        assert_eq!(parse_path(path), Some((504230, ImageKind::Hero)));
    }
}
