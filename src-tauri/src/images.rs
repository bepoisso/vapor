//! Game art served to the webview through the `vapor` URI scheme, so the frontend never sees
//! file paths. URL shape: `vapor://localhost/img/<appid>/<kind>` and `vapor://localhost/avatar`,
//! which WebView2 on Windows exposes as `http://vapor.localhost/...`.
//!
//! Grids get resized thumbnails (decoding hundreds of full-size covers costs time and memory);
//! the hero gets the original banner. Thumbnails are generated on first request and cached.

use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::{Path, PathBuf};

use fast_image_resize::{ResizeAlg, ResizeOptions, Resizer, images::Image};
use image::{ImageEncoder, codecs::jpeg::JpegEncoder};
use tauri::http::{HeaderValue, Response, StatusCode, header};

use crate::error::Error;
use crate::model::{AppId, GameImages};
use crate::steam::artwork::ArtPaths;

pub const SCHEME: &str = "vapor";

#[cfg(windows)]
const BASE_URL: &str = "http://vapor.localhost";
#[cfg(not(windows))]
const BASE_URL: &str = "vapor://localhost";

const THUMBNAIL_QUALITY: u8 = 85;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Cover,
    CoverSmall,
    Hero,
    HeroSmall,
    Logo,
}

impl ImageKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Cover => "cover",
            Self::CoverSmall => "cover-small",
            Self::Hero => "hero",
            Self::HeroSmall => "hero-small",
            Self::Logo => "logo",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "cover" => Some(Self::Cover),
            "cover-small" => Some(Self::CoverSmall),
            "hero" => Some(Self::Hero),
            "hero-small" => Some(Self::HeroSmall),
            "logo" => Some(Self::Logo),
            _ => None,
        }
    }

    /// Width of the generated thumbnail, or `None` to serve the original file. Shelf covers are
    /// shown up to ~180 CSS px wide, dense-grid covers ~120, wide cards ~340: 2× for high-DPI
    /// screens. Smaller files also mean less decoded-image memory in WebView2.
    fn thumbnail_width(self) -> Option<u32> {
        match self {
            Self::Cover => Some(360),
            Self::CoverSmall => Some(240),
            Self::HeroSmall => Some(720),
            Self::Hero | Self::Logo => None,
        }
    }

    pub fn source(self, art: &ArtPaths) -> Option<&Path> {
        match self {
            Self::Cover | Self::CoverSmall => art.cover.as_deref(),
            Self::Hero | Self::HeroSmall => art.hero.as_deref(),
            Self::Logo => art.logo.as_deref(),
        }
    }
}

pub fn image_url(app_id: AppId, kind: ImageKind) -> String {
    format!("{BASE_URL}/img/{app_id}/{}", kind.as_str())
}

pub fn avatar_url() -> String {
    format!("{BASE_URL}/avatar")
}

/// URLs for the art that exists. `logo_usable` is false for logos too dark to read.
pub fn game_images(app_id: AppId, art: &ArtPaths, logo_usable: bool) -> GameImages {
    let url = |kind: ImageKind| kind.source(art).map(|_| image_url(app_id, kind));
    GameImages {
        cover: url(ImageKind::Cover),
        cover_small: url(ImageKind::CoverSmall),
        hero: url(ImageKind::Hero),
        hero_small: url(ImageKind::HeroSmall),
        logo: if logo_usable {
            url(ImageKind::Logo)
        } else {
            None
        },
    }
}

/// URLs for a game Vapor has no local art index for (owned, not installed): the protocol looks
/// in Steam's library cache, then the Steam CDN. Logos are skipped: their darkness is unknown.
pub fn remote_game_images(app_id: AppId) -> GameImages {
    GameImages {
        cover: Some(image_url(app_id, ImageKind::Cover)),
        cover_small: Some(image_url(app_id, ImageKind::CoverSmall)),
        hero: Some(image_url(app_id, ImageKind::Hero)),
        hero_small: Some(image_url(app_id, ImageKind::HeroSmall)),
        logo: None,
    }
}

/// What a `vapor://` request asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageRequest {
    Art(AppId, ImageKind),
    Avatar,
}

impl ImageRequest {
    /// The avatar is served as is, like originals.
    pub fn kind(&self) -> ImageKind {
        match self {
            Self::Art(_, kind) => *kind,
            Self::Avatar => ImageKind::Logo,
        }
    }
}

pub fn parse_path(path: &str) -> Option<ImageRequest> {
    let mut parts = path.trim_start_matches('/').split('/');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some("avatar"), None, None, None) => Some(ImageRequest::Avatar),
        (Some("img"), Some(app_id), Some(kind), None) => Some(ImageRequest::Art(
            app_id.parse().ok()?,
            ImageKind::parse(kind)?,
        )),
        _ => None,
    }
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("png") => "image/png",
        _ => "image/jpeg",
    }
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
        // Art rarely changes during a session; a rescan changes nothing the webview cached wrongly
        // for longer than this.
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("max-age=3600"),
        );
    }
    response
}

/// Serves `source` as is, or a cached thumbnail of it.
pub fn serve(source: &Path, kind: ImageKind, thumbnail_dir: &Path) -> Response<Vec<u8>> {
    let file = match kind.thumbnail_width() {
        Some(width) => {
            thumbnail(source, width, thumbnail_dir).unwrap_or_else(|_| source.to_owned())
        }
        None => source.to_owned(),
    };
    match std::fs::read(&file) {
        Ok(bytes) => response(StatusCode::OK, Some(content_type(&file)), bytes),
        Err(_) => not_found(),
    }
}

pub fn not_found() -> Response<Vec<u8>> {
    response(StatusCode::NOT_FOUND, None, Vec::new())
}

pub fn bad_request() -> Response<Vec<u8>> {
    response(StatusCode::BAD_REQUEST, None, Vec::new())
}

/// Path of the cached thumbnail, generating it if needed. The name hashes the source path, size
/// and modification time, so a changed source gets a new thumbnail.
fn thumbnail(source: &Path, width: u32, dir: &Path) -> Result<PathBuf, Error> {
    let io_error = |source_error| Error::Io {
        path: source.to_owned(),
        source: source_error,
    };
    let metadata = std::fs::metadata(source).map_err(io_error)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    metadata.modified().ok().hash(&mut hasher);
    let target = dir.join(format!("{:016x}-{width}.jpg", hasher.finish()));
    if target.is_file() {
        return Ok(target);
    }

    let bytes = resize_to_jpeg(source, width)?;
    std::fs::create_dir_all(dir).map_err(io_error)?;
    // Write then rename, so a concurrent request never reads a half-written file.
    let partial = target.with_extension(format!("{}.tmp", std::process::id()));
    std::fs::write(&partial, bytes).map_err(io_error)?;
    std::fs::rename(&partial, &target).map_err(io_error)?;
    Ok(target)
}

fn resize_to_jpeg(source: &Path, width: u32) -> Result<Vec<u8>, Error> {
    let image_error = |message: String| Error::Image {
        path: source.to_owned(),
        message,
    };
    let original = image::open(source)
        .map_err(|error| image_error(error.to_string()))?
        .into_rgb8();
    let (src_width, src_height) = original.dimensions();
    // Never upscale.
    let width = width.min(src_width);
    let height = ((u64::from(src_height) * u64::from(width)) / u64::from(src_width.max(1))).max(1);
    let height = u32::try_from(height).map_err(|error| image_error(error.to_string()))?;

    let mut resized = Image::new(width, height, fast_image_resize::PixelType::U8x3);
    Resizer::new()
        .resize(
            &original,
            &mut resized,
            &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(
                fast_image_resize::FilterType::Lanczos3,
            )),
        )
        .map_err(|error| image_error(error.to_string()))?;

    let mut out = Cursor::new(Vec::new());
    JpegEncoder::new_with_quality(&mut out, THUMBNAIL_QUALITY)
        .write_image(
            resized.buffer(),
            width,
            height,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| image_error(error.to_string()))?;
    Ok(out.into_inner())
}

/// Below this mean luminance (0–255, gamma-encoded) a logo is unreadable on the dark UI.
const DARK_LOGO_LUMINANCE: f64 = 70.0;

/// True if the logo's opaque pixels are mostly dark (e.g. black-on-transparent logos).
pub fn is_dark_logo(path: &Path) -> Result<bool, Error> {
    let logo = image::open(path)
        .map_err(|error| Error::Image {
            path: path.to_owned(),
            message: error.to_string(),
        })?
        .into_rgba8();
    let (sum, count) =
        logo.pixels()
            .filter(|pixel| pixel[3] >= 128)
            .fold((0.0, 0_u64), |(sum, count), pixel| {
                let luminance = 0.2126 * f64::from(pixel[0])
                    + 0.7152 * f64::from(pixel[1])
                    + 0.0722 * f64::from(pixel[2]);
                (sum + luminance, count + 1)
            });
    Ok(count > 0 && sum / (count as f64) < DARK_LOGO_LUMINANCE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_image_paths() {
        assert_eq!(
            parse_path("/img/504230/cover"),
            Some(ImageRequest::Art(504230, ImageKind::Cover))
        );
        assert_eq!(
            parse_path("/img/730/hero-small"),
            Some(ImageRequest::Art(730, ImageKind::HeroSmall))
        );
        assert_eq!(parse_path("/avatar"), Some(ImageRequest::Avatar));
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
            "/avatar/x",
        ] {
            assert_eq!(parse_path(path), None, "{path}");
        }
    }

    #[test]
    fn builds_urls_the_handler_understands() {
        let url = image_url(504230, ImageKind::Hero);
        let (_, path) = url.split_once("localhost").unwrap();
        assert_eq!(
            parse_path(path),
            Some(ImageRequest::Art(504230, ImageKind::Hero))
        );
    }

    #[test]
    fn only_lists_existing_art_and_readable_logos() {
        let art = ArtPaths {
            cover: Some(PathBuf::from("c.jpg")),
            hero: None,
            logo: Some(PathBuf::from("l.png")),
        };
        let images = game_images(1, &art, false);
        assert!(images.cover.is_some());
        assert_eq!(images.hero, None);
        assert_eq!(images.hero_small, None);
        assert_eq!(images.logo, None);
    }

    #[test]
    fn thumbnails_are_resized_and_cached() {
        let dir = std::env::temp_dir().join(format!("vapor-thumb-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("cover.png");
        image::RgbImage::from_pixel(600, 900, image::Rgb([200, 40, 40]))
            .save(&source)
            .unwrap();

        let thumb = thumbnail(&source, 360, &dir.join("thumbs")).unwrap();
        let decoded = image::open(&thumb).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (360, 540));
        assert_eq!(thumbnail(&source, 360, &dir.join("thumbs")).unwrap(), thumb);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn detects_dark_logos() {
        let dir = std::env::temp_dir().join(format!("vapor-logo-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let dark = dir.join("dark.png");
        let light = dir.join("light.png");
        image::RgbaImage::from_pixel(40, 20, image::Rgba([20, 20, 24, 255]))
            .save(&dark)
            .unwrap();
        image::RgbaImage::from_pixel(40, 20, image::Rgba([240, 240, 240, 255]))
            .save(&light)
            .unwrap();
        assert!(is_dark_logo(&dark).unwrap());
        assert!(!is_dark_logo(&light).unwrap());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
