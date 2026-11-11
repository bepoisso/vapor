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
