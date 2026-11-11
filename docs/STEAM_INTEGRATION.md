# Steam integration

Goal: show the user's real library with real art and stats, and launch games — with no Steam UI in the way.
Approach: **local-first** (read the Steam install on disk — fast, offline, no API key), **enriched** by Steam web APIs when available.

> Items marked **[verify]** are believed correct but must be checked against a real install / current docs before relying on them.

## 1. Find Steam
- Windows: registry `HKCU\Software\Valve\Steam` → `SteamPath` (fallback `C:\Program Files (x86)\Steam`).
- Linux: `~/.steam/steam` or `~/.local/share/Steam`. macOS: `~/Library/Application Support/Steam`.
- Steam config files are **VDF/KeyValues** text. Use a VDF parser crate (e.g. `keyvalues-parser` or `steam-vdf`), don't hand-roll regexes.

## 2. Which games exist and which are installed
- `steamapps/libraryfolders.vdf` → all library folders (one per drive) and the app IDs each contains.
- In each library: `steamapps/appmanifest_<appid>.acf` → `name`, `installdir`, `SizeOnDisk`, `StateFlags` (fully installed vs. update needed), `LastUpdated`.
- That gives **installed** games only. For the **full owned library** (including not installed):
  - Option A (recommended): Steam Web API `IPlayerService/GetOwnedGames/v1` with `include_appinfo=1` → app IDs, names, `playtime_forever`, `rtime_last_played`. Needs a Web API key + the user's SteamID64 (see Auth).
  - Option B (no key): local files only (licenses are in binary caches — avoid). Fall back to installed + recently played.

## 3. User identity, playtime, last played
- `config/loginusers.vdf` → logged-in accounts: SteamID64, `PersonaName`, `MostRecent`, `Timestamp`. Pick `MostRecent`, else the latest `Timestamp` (`MostRecent` is absent when only one account exists). Avatar: `config/avatarcache/<steamid64>.png`.
- `userdata/<accountId>/config/localconfig.vdf` → `UserLocalConfigStore/Software/Valve/Steam/apps/<appid>` with `LastPlayed` (unix seconds) and `Playtime` (minutes), plus `cloud/last_sync_state` (`synchronized`). **Verified** on the owner's machine (Celeste: 2806 min, last played Jan 6 2026). `accountId` = SteamID64 − 76561197960265728.
- User collections (Steam "categories" like FAVORITES) live in `userdata/<accountId>/config/cloudstorage/cloud-storage-namespace-1.json` under keys starting with `user-collections.` **[verify]**. Import them read-only as manual shelves; never write to Steam's files.

## 4. Images (the art in the mockup comes from here)
- `appcache/librarycache/<appid>/` contains `library_600x900.jpg` (cover), `library_hero.jpg` (1920×620 banner), `logo.png` (transparent), `header.jpg` / `library_header.jpg`, `library_hero_blur.jpg`.
- **Gotcha seen on the author's machine:** for many games the files are inside **hash-named subfolders**, e.g. `librarycache/367520/1eebc7e0…/library_capsule.jpg`, and names vary (`library_capsule.jpg` instead of `library_600x900.jpg`, localized `logo_french.png`, `library_header_french.jpg`). So: scan the app folder **recursively** and pick by pattern, in this priority:
  - cover: `library_600x900*.jpg` → `library_capsule*.jpg`
  - hero: `library_hero.jpg` (not `_blur`) → `library_hero_*.jpg` (not `_blur`)
  - logo: `logo.png` → `logo_<lang>.png` → `logo_*.png`
  - header: `library_header*.jpg` → `header*.jpg`
- Cache the resolved paths in Vapor's own index; serve them to the webview via Tauri's asset protocol (`convertFileSrc`) — no copying.
- Fallback when missing: Steam CDN `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg` (and `library_hero.jpg`, `logo.png`, `header.jpg`). Newer titles may use hashed CDN paths and 404 here; the Store API's `header_image` field gives a working URL. Cache downloads in the app data dir.
- Some logos are dark-on-transparent (e.g. Counter-Strike 2, Half-Life 2) and unreadable on dark backgrounds. Detect low luminance on the logo's opaque pixels and fall back to the text title.

## 5. Genres, modes and tags (needed for shelves, moods, facets)
- `https://store.steampowered.com/api/appdetails?appids=<id>` → `genres[]` (Action, Indie, RPG…) and `categories[]` (Single-player, Multi-player, Online PvP, Online Co-op…). Map categories → `modes` (Solo / Coop / PvP). It is an **unofficial, rate-limited** endpoint **[verify current limits]**: fetch lazily, one app at a time with backoff, cache forever (refresh monthly).
- User-defined Steam tags (e.g. "Difficult", "Story Rich") are not in `appdetails`. Options: SteamSpy API (third-party), or let users tag games themselves in Vapor. Ship with: genres + categories from the Store API, plus **user tags** stored locally. Flag any scraping to the owner first.
- Vapor's internal "vibe" tags (Hard, Story, Chill, Short sessions…) = a mapping table from Steam genres/tags + user overrides. Keep the mapping in a JSON file so it's editable.

## 6. Achievements & cloud
- Achievements: `ISteamUserStats/GetPlayerAchievements/v1` (unlocked) + `ISteamUserStats/GetSchemaForGame/v2` (total, names, icons). Needs key + public game details, or the user's own key.
- Cloud save status: no clean public source. Show it only if reliably known; otherwise hide the field (don't fake "Cloud synced").

## 7. Launching, installing, updating
- Launch: open `steam://rungameid/<appid>` with the OS URL handler (Rust: `open` crate / `ShellExecute`). Steam starts in the background if it isn't running.
- Install: `steam://install/<appid>`. Uninstall: `steam://uninstall/<appid>`. Validate: `steam://validate/<appid>`.
- To keep Steam out of sight: if Steam isn't running, start it first with `steam.exe -silent` (tray only), then send the `steam://` URL.
- **Honest limitation:** most games use Steam DRM / Steamworks and require the Steam client process running. Vapor replaces the *UI*, not the client. State this clearly in the README for end users.
- Detect "running" state: watch for the game's process (from `installdir`) or poll `HKCU\Software\Valve\Steam\RunningAppID` on Windows (**verified**: exists, `0` when nothing runs).

## 8. Auth & API key
- Identity: Steam **OpenID 2.0** (`https://steamcommunity.com/openid`) in a webview → returns the SteamID64. No password ever touches Vapor.
- Web API key: an open-source app must **not** ship a shared key. Let each user paste their own key (from `https://steamcommunity.com/dev/apikey`) in Settings, stored in the OS keychain (`keyring` crate). Without a key, Vapor runs in local-only mode (installed games, local playtime, local art).
- Privacy: some API data requires the user's "Game details" to be public unless using their own key **[verify]**.

## 9. Suggested backend shape (Rust, Tauri commands)
```
get_library() -> Vec<Game>          // merged local + API, served from Vapor's cache, refreshed in background
get_game(app_id) -> GameDetail
launch(app_id) / install(app_id)
list_shelves() / save_shelf(shelf) / delete_shelf(id)
set_user_tags(app_id, tags)
settings: get/set (api key in keychain, steam path override, steam account)
```
Emit a `library-updated` event when the background refresh finishes so the UI can update without blocking first paint.
