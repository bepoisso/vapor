//! Images Steam's APIs point at (achievement icons, friend avatars, news pictures), proxied
//! through the `vapor` protocol: the webview's CSP only allows Vapor's own images, and the
//! backend fetches only URLs it registered itself from Steam API answers, on Steam's hosts.
//! Downloads are cached on disk by URL hash.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{PoisonError, RwLock};

use reqwest::{Client, Url};

use crate::error::Error;
use crate::images;
use crate::web::network_error;

/// Hosts Steam serves user-facing images from.
fn allowed(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    url.scheme() == "https"
        && (host.ends_with(".steamstatic.com")
            || host == "steamcdn-a.akamaihd.net"
            || host == "steamuserimages-a.akamaihd.net")
}

/// Stable across builds (unlike `DefaultHasher`), so cached files stay valid: 64-bit FNV-1a.
fn key_of(url: &str) -> String {
    let hash = url.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    format!("{hash:016x}")
}

fn extension(url: &Url) -> &'static str {
    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".png") {
        "png"
    } else if path.ends_with(".gif") {
        "gif"
    } else if path.ends_with(".webp") {
        "webp"
    } else {
        "jpg"
    }
}

pub struct RemoteImages {
    dir: PathBuf,
    /// Key → URL, for every URL handed to the UI this session.
    known: RwLock<HashMap<String, Url>>,
}

/// Size served for a remote image.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteSize {
    Original,
    /// A thumbnail ~320 px wide (news cards).
    Thumb,
}

impl RemoteSize {
    pub fn thumbnail_width(self) -> Option<u32> {
        match self {
            Self::Original => None,
            Self::Thumb => Some(320),
        }
    }
}

impl RemoteImages {
    pub fn new(cache_dir: &Path) -> Self {
        Self {
            dir: cache_dir.join("remote"),
            known: RwLock::new(HashMap::new()),
        }
    }

    /// The `vapor` URL serving `url`, or `None` when it is not on a Steam image host.
    pub fn register(&self, url: &str, size: RemoteSize) -> Option<String> {
        let parsed = Url::parse(url).ok().filter(allowed)?;
        let key = key_of(parsed.as_str());
        let vapor_url = images::remote_url(&key, size);
        self.known
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(key, parsed);
        Some(vapor_url)
    }

    fn cached(&self, key: &str) -> Option<PathBuf> {
        ["jpg", "png", "gif", "webp"]
            .iter()
            .map(|extension| self.dir.join(format!("{key}.{extension}")))
            .find(|path| path.is_file())
    }

    /// The image file for `key`, downloading it first if needed. `None` for unknown keys.
    pub async fn fetch(&self, client: &Client, key: &str) -> Result<Option<PathBuf>, Error> {
        if let Some(path) = self.cached(key) {
            return Ok(Some(path));
        }
        let url = self
            .known
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .get(key)
            .cloned();
        let Some(url) = url else {
            return Ok(None);
        };
        let path = self.dir.join(format!("{key}.{}", extension(&url)));
        let bytes = client
            .get(url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(network_error)?
            .bytes()
            .await
            .map_err(network_error)?;
        let io_error = |source| Error::Io {
            path: path.clone(),
            source,
        };
        std::fs::create_dir_all(&self.dir).map_err(io_error)?;
        let partial = path.with_extension("part");
        std::fs::write(&partial, &bytes).map_err(io_error)?;
        std::fs::rename(&partial, &path).map_err(io_error)?;
        Ok(Some(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_registers_steam_image_hosts() {
        let remote = RemoteImages::new(Path::new("cache"));
        for url in [
            "https://avatars.steamstatic.com/abc_medium.jpg",
            "https://clan.akamai.steamstatic.com/images/1/x.png",
            "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/1/x.jpg",
        ] {
            assert!(
                remote.register(url, RemoteSize::Original).is_some(),
                "{url}"
            );
        }
        for url in [
            "http://avatars.steamstatic.com/abc.jpg",
            "https://evil.example.com/x.jpg",
            "https://steamstatic.com.evil.example/x.jpg",
            "file:///C:/Windows/win.ini",
            "not a url",
        ] {
            assert_eq!(remote.register(url, RemoteSize::Original), None, "{url}");
        }
    }

    #[test]
    fn keys_are_stable() {
        assert_eq!(key_of("https://a"), key_of("https://a"));
        assert_ne!(key_of("https://a"), key_of("https://b"));
        assert_eq!(key_of("").len(), 16);
    }
}
