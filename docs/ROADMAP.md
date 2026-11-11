# Roadmap

Work one phase at a time. Each phase ends with lint + type-check + tests passing and a short summary to the owner.

Performance budgets (see `CLAUDE.md`) are checked at the end of every phase, not only in Phase 6.

## Phase 0 — Confirm & scaffold ✅
- Stack confirmed (see `docs/DECISIONS.md`).
- Scaffold the app, add ESLint/Prettier, `clippy`, Vitest, a CI workflow (GitHub Actions: lint, test, build on Windows).
- Add design tokens from `DESIGN_SYSTEM.md` as CSS variables; bundle the Geist font locally.
- Add `.gitignore` entry `mockups/assets/`; add an MIT license and a README draft for end users.
- **Done when:** the empty app window opens with the dark background and the top bar.

## Phase 1 — Library UI on sample data ✅
- Build the Library page from `mockups/library.html` with React components, fed by `mockups/data/games.sample.json` through the same interface the real backend will use (`get_library()` mocked).
- Components: TopBar, Hero, CoverCard, WideCard, MoodModule, SmartShelf, FacetBox, LibraryGrid, rule engine (`matches`) with unit tests (AND/OR, facet counts).
- **Done when:** side-by-side with the mockup at 1440px it matches visually; mood pills and facet chips behave as in the mockup; rule engine tests pass.
- Delivered: `get_library` / `list_shelves` commands (sample data), `vapor://` image protocol, startup tracing, `pnpm compare:mockup` and `pnpm perf:*` tools.

## Phase 2 — Real Steam data (local)
- Rust: find Steam, parse `libraryfolders.vdf`, `appmanifest_*.acf`, `loginusers.vdf`, `localconfig.vdf`; resolve images in `librarycache` with the recursive pattern rules.
- Pick the `MostRecent` account in `loginusers.vdf`; read all library folders.
- Vapor index cache (SQLite) in the app data dir; background rescan + `notify` watcher, `library-updated` event.
- Images: a `vapor://` protocol serving resized, disk-cached thumbnails to grids (full-size art only for the hero); dark-logo detection.
- Text files only (no `appinfo.vdf`, owner's decision): non-games filtered by a known-ID list; genres/modes/tags arrive in Phase 4.
- **Done when:** the Library shows the owner's installed games with real art, playtime and last played, loading from cache in under ~300 ms.

## Phase 3 — Launch & install
- `launch` / `install` via `steam://` URLs, start Steam with `-silent` if needed, running-state indicator on the Play button.
- **Done when:** clicking Play starts a game with no Steam window appearing.

## Phase 4 — Enrichment
- Settings page: Steam API key (keychain), Steam path override, Steam account.
- Owned games via `GetOwnedGames`; genres/categories via Store API (lazy, cached); achievements.
- Vibe-tag mapping file + user tags.
- **Done when:** not-installed owned games appear (with Install), facets/moods use real genres/modes.

## Phase 5 — Smart shelves editing
- Rule builder modal, "Save as shelf" from facets, reorder/rename/delete, import Steam collections read-only.

## Phase 6 — Performance & polish
- Profile with a synthetic library of 3,000 games; enforce the budgets in CI where measurable.
- Empty and error states, offline mode.
- **Done when:** every budget in `CLAUDE.md` is met on the owner's machine.

## Phase 7 — Distribution
- NSIS/MSI installers via `tauri-action`, GitHub Releases, signed auto-update (`tauri-plugin-updater`).
- End-user README (including the honest limitation: Steam must run in the background).
- Optional: Windows code signing (otherwise SmartScreen warns on first launch).
- **Done when:** a user can download, install and update Vapor from GitHub Releases.

## Later
Game page (to be designed next), Store & Community webviews, profile, command palette, Linux/macOS builds.
