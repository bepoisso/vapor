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
