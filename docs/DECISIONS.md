# Decisions

Short log of decisions taken with the owner. Newest last. Each entry: what, why, consequences.

## 2026-11-11 — Stack
- **Tauri 2 + React 19 + TypeScript + Vite, pnpm.** Electron was rejected: ~150 MB binary and ~200 MB RAM go against "faster than Steam". Native toolkits (Slint, egui, WinUI) were rejected: matching the Nebula mockup would cost far more.
- **React Compiler** (Babel preset, stable) instead of manual memoization.
- **TanStack Router** (hash history), **Zustand**, **TanStack Virtual**, **react-i18next**, **lucide-react**, CSS Modules on top of the design tokens.
- **tauri-specta** generates the TypeScript bindings for commands. It is a release candidate, so `specta`, `specta-typescript` and `tauri-specta` are pinned to exact versions.
- Toolchain pins: TypeScript 6 and ESLint 9 (TypeScript 7 and ESLint 10 exist but `typescript-eslint` and `eslint-plugin-jsx-a11y` don't support them yet). Revisit when they do.
- Rust: SQLite (`rusqlite`, bundled) for Vapor's index cache, `keyvalues-parser` for VDF, `keyring` for the API key, `notify` to watch Steam files, `image` for thumbnails and logo luminance.

## 2026-11-11 — Vibe tags
- Vibe tags (Hard, Story, Chill, Short sessions…) come from **a mapping of Steam genres/categories plus the user's own tags**. No third-party API (SteamSpy) and no scraping.

## 2026-11-11 — License & visibility
- **MIT**, repository **public from day one**. Copyrighted game art (`mockups/assets/`) stays out of git.

## 2026-11-11 — Steam accounts
- Several accounts can exist in `userdata/` (the owner's machine has two). Use the `MostRecent` account from `loginusers.vdf` by default; Settings will offer an account switcher (Phase 4).

## 2026-11-11 — Facts verified on the owner's machine
- `SteamPath` registry value exists; 4 library folders (C:, D:, E:, F:) listed in `libraryfolders.vdf`.
- `localconfig.vdf` stores `LastPlayed` (unix seconds) and `Playtime` (minutes) per app.
- `HKCU\Software\Valve\Steam\RunningAppID` exists (`0` when nothing runs).
- `librarycache/<appid>/` uses hash-named subfolders for many games.
- `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json` exists.

## 2026-11-11 — UI language
- The app UI is **English only** (no French locale). Supersedes the original `en` + `fr` plan. Strings stay in `src/i18n/locales/en.json` behind react-i18next so a language can be added later without touching components.

## 2026-11-11 — Phase 1 data model & UI choices
- **Rules nest.** `Rule { all?: RuleNode[]; any?: RuleNode[] }` where a node is a condition or a sub-rule. The spec's flat `{ all?: Condition[]; any?: Condition[] }` cannot express "Save as shelf" (one OR group per facet, facets ANDed), e.g. `(Platformer OR RPG) AND Coop`.
- **Unknown is `null`, not absent.** Generated types use `T | null` (e.g. `genre: string | null` until the Store API fills it). The UI hides unknown values instead of guessing.
- **Images go through a `vapor://` protocol** (`http://vapor.localhost/img/<appid>/<cover|hero|logo>` on Windows). The frontend never sees file paths. Phase 1 serves `mockups/assets/`; Phase 2 swaps in Steam's librarycache and resized thumbnails.
- **Fixed top bar.** In the mockup it scrolls away with the hero. Search filters the Library grid far below, so the bar stays fixed: transparent over the hero, solid background once scrolled.
- **Genre chips are ordered by game count** (most common first), not by first appearance as in the mockup. Vibe tags keep the mockup order.
- **Mood suggestions follow the spec** (installed first, then not played recently, then a per-day stable shuffle), so they differ from the mockup's "first 4 matches".
- The sample data got made-up `lastPlayed` dates for the six other "Recently played" games of the mockup (only Celeste's values are real).
- Facet chips are labelled for screen readers as "Platformer, 2 games".

## 2026-11-11 — Phase 2: reading the Steam install
- **Text files only.** Vapor reads `libraryfolders.vdf`, `appmanifest_*.acf`, `loginusers.vdf` and `localconfig.vdf`, plus `librarycache/` and `avatarcache/`. Steam's binary cache `appcache/appinfo.vdf` (app type, genres, categories) was proposed and **declined by the owner** (undocumented format).
  - Consequence: non-games (redistributables, SteamVR, Wallpaper Engine, Proton…) are filtered by a hand-kept list (`steam/non_games.rs`) until the Store API gives the app type (Phase 4).
  - Consequence: genres, modes and tags stay empty until Phase 4, so the UI hides facets, moods and shelves that have nothing to show.
- **Cache = JSON snapshot of raw Steam facts** (`<cache dir>/library-cache.json`), not SQLite. One read at startup (~1 ms), and the `Game` list is rebuilt from it on demand. SQLite can come back if Phase 4's Store API cache needs queries.
- **Account**: the `MostRecent` account, else the latest `Timestamp`. Recent Steam versions drop `MostRecent` when there is a single account (seen on the owner's machine).
- **Cloud status** comes from `localconfig.vdf` (`cloud/last_sync_state`). Only `synchronized` is mapped (to "Cloud synced"); any other state is treated as unknown and hidden.
- **Images**: covers and wide cards get JPEG thumbnails (360 and 720 px wide), generated on first request and cached in `<cache dir>/thumbnails/`. The hero gets the original banner. Logos whose opaque pixels average below luminance 70/255 count as unreadable on the dark UI, and the hero shows the name instead (6 of the owner's 61 games, e.g. F1 22, The Lab).
- **Freshness**: startup serves the cached snapshot; a background scan and a file watcher on manifests, `loginusers.vdf` and `localconfig.vdf` rescan Steam and emit `library-updated` when something changed.
- `VAPOR_LIBRARY=sample` serves the mockup's sample library instead of Steam. `pnpm compare:mockup` and `pnpm perf:library` use it so their results are reproducible.

## 2026-11-11 — Window shown immediately
- The window opens **visible right away** on the app background (`#0B0B0F`); the page content fades in (opacity, 250 ms) once the library has rendered with data and the font is ready. Chosen by the owner over "keep the window hidden until the page is fully rendered".
- Why: ~450 ms of startup is WebView2 starting before any app code runs, so a window that waits for the rendered page can never appear in < 300 ms. Showing the dark window first makes the app feel instant, and the fade avoids a half-filled page popping in.

## 2026-11-11 — Phase 3: launching through Steam
- **How a game starts**: Vapor runs `steam.exe -- steam://rungameid/<appid>`, exactly what Windows' `steam://` URL handler does (`"steam.exe" -- "%1"`, verified in the registry). Installs use `steam://install/<appid>`, which opens Steam's own install dialog (drive, size): the one Steam window that is expected.
- **Steam not running**: `-silent` is added, so Steam starts in the tray without its main window. "Running" = `HKCU\Software\Valve\Steam\ActiveProcess\pid` is non-zero and that process is `steam.exe` (the PID is stale after a crash). When unsure, Vapor passes `-silent` anyway (harmless for a running Steam).
- **Running indicator**: `HKCU\Software\Valve\Steam\RunningAppID` is polled every second on Windows and changes are sent as a `running-game-changed` event. Play buttons show "Launching…" from the click until Steam reports the game (up to 60 s, then reset), then "Playing" while it runs. Other platforms: launch works, no indicator yet.
- **Steam's launch notice**: Steam still shows its small "launching…" notice for a moment. It appears for every `steam://` launch and there is no supported way to hide it, so it stays (verified by the owner on 2026-11-11).

## 2026-11-12 — Phase 4a: Web API, settings, owned games
- **No OpenID login.** The account comes from the local Steam install (`loginusers.vdf`); Settings can pick another account that signed in on this machine. No Steam login page inside Vapor.
- **API key**: pasted in Settings, **checked against the Web API before it is stored** (a rejected key is never saved), then kept in the OS keychain (Windows Credential Manager, `keyring` crate), never in a file. Network error messages are stripped of URLs, since the key travels as a query parameter.
- **Owned games** (`IPlayerService/GetOwnedGames`): refreshed in the background at most hourly, or when the key or account changes. Not-installed games appear in the library with an **Install** button, and their covers are dimmed. For installed games, playtime and last played take the larger of the local and Web API values (the Web API counts every machine).
- **Achievements** (`ISteamUserStats/GetPlayerAchievements`): fetched for played games only, 150 ms apart, and fetched again only after the game was played again. Games without achievements show none.
- **Art for not-installed games**: Steam's own `librarycache` first (Steam caches art for library games it has shown), then the public Steam CDN, downloaded once and cached in `<cache dir>/cdn/`. CDN misses are remembered for a week.
- **Settings** live in `<config dir>/io.github.bepoisso.vapor/settings.json` (Steam folder override, account, Store opt-in). The Settings page opens from the profile menu (persona name, top right).

## 2026-11-12 — Phase 4b: genres, modes and vibe tags
- **Store `appdetails` is opt-in, off by default** (Settings → "Genres and modes from the Steam Store"). The endpoint is unofficial and undocumented; it is flagged in the UI and only called once the user turns it on. Requests go one at a time, 1.5 s apart (the endpoint allows ~200 per 5 min), and stop on HTTP 429. Results are cached for 30 days. Turning the option off forgets the fetched details.
- From the Store details:
  - **genre** = the first genre that isn't a business-model genre (Indie, Free To Play, Early Access, Massively Multiplayer);
  - **modes** come from category IDs: Solo 2; Co-op 9, 38, 39, 48; PvP 36, 37, 47, 49;
  - apps whose Store type is not `game`, `demo` or `mod` are dropped from the library. This complements the hand-kept non-game list.
- **Vibe tags** = the bundled mapping `src-tauri/src/library/vibe-mapping.json` (Store genres and categories → vibes), which a copy at `<config dir>/io.github.bepoisso.vapor/vibe-mapping.json` overrides. "Hard" has no Store equivalent and comes only from the user's own tags.
- **User tags**: edited from a cover's "⋯" menu (or right-click) in a modal `<dialog>`. They are stored as additions and removals on top of the mapped tags (`<config dir>/…/user-tags.json`), so remapping a game keeps the user's choices.

## 2026-11-12 — Phase 5: editing smart shelves
- **Persistence**: shelves live in `<config dir>/io.github.bepoisso.vapor/shelves.json`. The defaults are seeded on first run and flagged `seeded`.
- **Visibility**: a default shelf with no match stays hidden (spec). A shelf the user created or edited always shows, with "No game matches this rule yet.", so it never disappears before it can be fixed.
- **Rule builder**: rows combined with "All conditions" (AND) or "Any condition" (OR). A row is a field plus its values: genre, mode and vibe accept several values, OR'ed. This is exactly the shape "Save as shelf" produces, so filter-made shelves stay editable. Rules of any other shape can still be renamed and deleted. An empty name defaults to the rule summary ("(Platformer or RPG) + Coop").
- **Shelf actions**: a "⋯" menu next to the title offers Edit (name, rule, delete with a second click to confirm), Move up and Move down. Moves swap with the visible neighbor.
- **Steam collections**: imported read-only from `userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json` (`user-collections.*`). They are shown after the smart shelves with a "Steam collection" badge. Dynamic collections, deleted ones and Steam's "hidden" collection are skipped. Games the user hid in Steam are not hidden in Vapor yet: that is a possible follow-up.

## 2026-11-13 — Phase 6: performance
- **i18next → a typed string table** (`src/i18n`): the same `useTranslation()` / `t()` API, keys checked at compile time, plurals via `Intl.PluralRules`. The UI is English only, so the framework was ~100 KB of startup code for nothing. Adding a language later means adding a locale file and a picker.
- **TanStack Router → a minimal hash router** (`src/app/navigation.ts`, `src/components/Link.tsx`): links are plain `<a href="#/…">`, which matters with one link per cover in grids; `NavLink` handles the top bar tabs. Unknown paths show the Library.
- **Startup bundle**: 473 KB → 339 KB (153 → 107 KB gzip). `pnpm check:bundle` runs in CI and fails above 380 KB / 125 KB gzip.
- **Grid**: `CoverCard` is memoized, idle "⋯" buttons use `display: none` (not painted), and the dense grid uses 240 px thumbnails (shelves keep 360 px).
- **Typed errors**: a command error has a `kind` (`steamNotFound`, `invalidApiKey`, `network`, `other`). The Library shows a "Vapor couldn't find Steam" notice with Open Settings, and an empty state when there is no game.
- **Measured** (owner's machine, release build, 2560×1369 at 180 Hz):
  - startup: window visible in ~50 ms; library painted in ~628 ms, down from ~700 ms (WebView2 ~423 ms, JS parse 68 ms, module evaluation 16 ms (was 32), page render 32 ms (was 41));
  - scroll with 3,000 games: 180 fps, p95 frame 5.7 ms, no frame over 20 ms;
  - interactions, median to the next painted frame (vsync wait included), at 200 / 3,000 games: search 7.7 / 17.5 ms, clear search 14.4 / 17 ms, facet chip 16–19 / 20–22 ms;
  - memory: Vapor 11 MB + WebView2 ~270 MB private (~285 MB total), of which the WebView2 GPU process is ~157 MB.
- **RAM budget (< 150 MB): open.** It is only reachable with `--disable-gpu` (software rendering: ~147 MB total). The cost is scroll dropping from 180 fps (p95 5.7 ms) to 119 fps (p95 16.6 ms, still 60 fps) and interactions getting 5–9 ms slower. `--disable-gpu-rasterization` gives ~248 MB, and `--enable-low-end-device-mode` has no effect. Decision pending with the owner.
