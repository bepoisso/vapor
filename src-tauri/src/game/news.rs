//! A game's news (the developer's announcements), cached per app for an hour.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock};

use serde::{Deserialize, Serialize};

use super::NewsItem;
use super::markup::{self, NewsBlock};
use crate::error::Error;
use crate::library::snapshot::iso8601_utc;
use crate::model::AppId;
use crate::remote_images::{RemoteImages, RemoteSize};
use crate::web::steam_api::{self, RawNews};

const MAX_AGE_SECS: u64 = 3600;
const COUNT: u32 = 10;
const EXCERPT_CHARS: usize = 220;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Cached {
    fetched_at: u64,
    items: Vec<RawNews>,
}

pub struct NewsService {
    dir: PathBuf,
    memory: RwLock<HashMap<AppId, Arc<Cached>>>,
}

impl NewsService {
    pub fn new(cache_dir: &Path) -> Self {
        Self {
            dir: cache_dir.join("news"),
            memory: RwLock::new(HashMap::new()),
        }
    }

    fn file(&self, app_id: AppId) -> PathBuf {
        self.dir.join(format!("{app_id}.json"))
    }

    fn cached(&self, app_id: AppId) -> Option<Arc<Cached>> {
        if let Some(found) = self
            .memory
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&app_id)
        {
            return Some(found.clone());
        }
        let cached: Cached = std::fs::read(self.file(app_id))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())?;
        let cached = Arc::new(cached);
        self.remember(app_id, cached.clone());
        Some(cached)
    }

    fn remember(&self, app_id: AppId, cached: Arc<Cached>) {
        self.memory
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(app_id, cached);
    }

    /// The latest posts, newest first. A failed fetch serves the stale cache when there is one.
    pub async fn get(
        &self,
        client: &reqwest::Client,
        app_id: AppId,
        now: u64,
    ) -> Result<Vec<RawNews>, Error> {
        let cached = self.cached(app_id);
        if let Some(cached) = &cached
            && now.saturating_sub(cached.fetched_at) < MAX_AGE_SECS
        {
            return Ok(cached.items.clone());
        }
        match steam_api::app_news(client, app_id, COUNT).await {
            Ok(items) => {
                let fresh = Cached {
                    fetched_at: now,
                    items: items.clone(),
                };
                let _ = std::fs::create_dir_all(&self.dir).and_then(|()| {
                    std::fs::write(
                        self.file(app_id),
                        serde_json::to_vec(&fresh).unwrap_or_default(),
                    )
                });
                self.remember(app_id, Arc::new(fresh));
                Ok(items)
            }
            Err(error) => cached.map(|cached| cached.items.clone()).ok_or(error),
        }
    }

    /// The Steam page of a cached post.
    pub fn url(&self, app_id: AppId, gid: &str) -> Option<String> {
        self.cached(app_id)?
            .items
            .iter()
            .find(|item| item.gid == gid)
            .map(|item| item.url.clone())
            .filter(|url| url.starts_with("https://"))
    }
}

/// A post as the page shows it: parsed body, Steam-hosted pictures proxied, others dropped.
pub fn to_item(raw: &RawNews, remote: &RemoteImages) -> NewsItem {
    let mut image = None;
    let body: Vec<NewsBlock> = markup::parse(&raw.contents)
        .into_iter()
        .filter_map(|block| match block {
            NewsBlock::Image { src } => {
                if image.is_none() {
                    image = remote.register(&src, RemoteSize::Thumb);
                }
                remote
                    .register(&src, RemoteSize::Original)
                    .map(|src| NewsBlock::Image { src })
            }
            other => Some(other),
        })
        .collect();
    NewsItem {
        gid: raw.gid.clone(),
        date: iso8601_utc(raw.date),
        title: raw.title.trim().to_owned(),
        excerpt: markup::excerpt(&body, EXCERPT_CHARS),
        image,
        body,
        has_url: raw.url.starts_with("https://"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_news_item() {
        let raw = RawNews {
            gid: "1784506358986604".into(),
            title: "New Merch! ".into(),
            url: "https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1784506358986604".into(),
            contents: "[img]{STEAM_CLAN_IMAGE}/28424520/913f.png[/img]\n\nHey there climbers!\n\n[img]https://evil.example.com/x.png[/img]".into(),
            date: 1_732_732_267,
        };
        let item = to_item(&raw, &RemoteImages::new(Path::new("cache")));
        assert_eq!(item.title, "New Merch!");
        assert_eq!(item.date, "2024-11-27T18:31:07Z");
        assert_eq!(item.excerpt, "Hey there climbers!");
        assert!(
            item.image
                .as_deref()
                .is_some_and(|url| url.ends_with("/thumb"))
        );
        // The second image is not on a Steam host.
        assert_eq!(item.body.len(), 2);
        assert!(item.has_url);
    }
}
