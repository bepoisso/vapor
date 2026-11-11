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
