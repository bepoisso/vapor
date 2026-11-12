//! The `vapor://` protocol handler: finds the file behind an image request (Vapor's art index,
//! Steam's library cache, else the Steam CDN) and serves it, resized for grids.

use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager};

use crate::images::{self, ImageRequest};
use crate::library::service::LibraryService;
use crate::web::{HttpClient, cdn};

pub async fn handle(app: AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(image) = images::parse_path(request.uri().path()) else {
        return images::bad_request();
    };
    let kind = image.kind();

    // File system work goes to the blocking pool.
    let local = {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            app.state::<LibraryService>().image_source(&image)
        })
        .await
        .ok()
        .flatten()
    };

    let source = match (local, image) {
        (Some(path), _) => Some(path),
        (None, ImageRequest::Art(app_id, kind)) => {
            let library = app.state::<LibraryService>();
            if library.uses_cdn() {
                let client = app.state::<HttpClient>().0.clone();
                cdn::fetch(&client, &library.cdn_dir(), app_id, kind)
                    .await
                    .ok()
                    .flatten()
            } else {
                None
            }
        }
        (None, ImageRequest::Avatar) => None,
    };

    let Some(source) = source else {
        return images::not_found();
    };
    let thumbnail_dir = app.state::<LibraryService>().thumbnail_dir();
    tauri::async_runtime::spawn_blocking(move || images::serve(&source, kind, &thumbnail_dir))
        .await
        .unwrap_or_else(|_| images::not_found())
}
