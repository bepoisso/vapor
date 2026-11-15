# Game page — functional spec

Approved design: **P1 · Classic, enriched**. Reference: `mockups/game.html`. Sample data: `mockups/data/game.celeste.sample.json`.
Route: `/game/:appId`. Opened from any game card, wide card, hero "Game page" button or search result.

## 0. Data model

```ts
interface GameDetail extends Game {          // Game is defined in LIBRARY_SPEC.md
  developer?: string;
  sizeOnDiskBytes?: number;
  favorite: boolean;
  achievements?: {
    unlocked: number; total: number;
    next?: Achievement;                       // see "Next achievement" rule below
    items: Achievement[];                     // loaded lazily for the Achievements tab
  };
  friends: Array<{ steamId: string; personaName: string; avatar?: string; recentPlaytimeMinutes?: number;
                   status: 'in_game' | 'played_recently' | 'owns' }>;
  friendsWishlisted?: number;
  activity: ActivityItem[];                   // friend achievements, friend started playing… newest first
  news: Array<{ gid: string; date: string; title: string; excerpt: string; url: string; image?: string }>;
  notes: string;                              // local only
}
interface Achievement { apiName: string; name: string; description?: string; icon?: string; iconGray?: string;
                        hidden: boolean; unlocked: boolean; unlockedAt?: string; globalPercent?: number }
```

Load strategy: render the hero + stat cards instantly from the cached `Game` (library data), then fill achievements, friends, activity and news as they arrive. Every block has a skeleton state and a "not available" state (e.g. no API key → hide friends/activity cards, show a one-line hint in Settings, not on the page).

## 1. Top bar
- **← Library** back button (restores library scroll position and filters).
- Same segmented nav and profile button as the library (no search here in v1).

## 2. Hero (560px)
- Background: `library_hero.jpg` with the same two scrims as the library hero.
- Kicker: `developer · genre · modes` (uppercase, skip unknown parts).
- Logo (`logo.png`, max 180px tall / 520px wide); fall back to the name as text (dark-logo rule from `STEAM_INTEGRATION.md`).
- Actions:
  - **Play** (primary). States: `idle` → "Play"; `launching` → spinner "Launching…"; `running` → neutral dark button "Running · Stop" (Stop = ask Steam to close / kill process after confirm); `not_installed` → "Install"; `update_required` → "Update".
  - **Favorite** toggle (heart, accent when on). Favorites = a manual collection, also shown as a shelf in the library.
  - **Settings** (gear) → menu: Properties (launch options), Browse local files, Verify integrity, Uninstall, Hide from library. All except "Hide" delegate to Steam (`steam://` URLs).
- Badges (bottom-right): `Installed · <size>` with green dot (or "Not installed"), cloud status (only if known).

## 3. Stat cards (4 columns)
1. **Playtime** — hours with one decimal (`46.8 h`, locale-aware: `46,8 h` in French).
2. **Last session** — short date; "Today"/"Yesterday" when relevant; "Never" if 0.
3. **Achievements** — `unlocked / total`, percent top-right, accent progress bar. Hide the card if the game has no achievements and use 3 columns.
4. **Friends playing** — first friend in priority `in_game` > `played_recently` > `owns`, with avatar, name and context line; "+N" stack if more. Hide when no data.

## 4. Tabs
`Overview` (default) · `Achievements <total>` · `News` · `Guides` · `Discussions` · `My notes` · right-aligned **Store page ↗**.
- Tabs are real `role="tab"` buttons with `aria-selected`; the selected tab has the accent underline. Persist the last tab per game.
- **Achievements**: full list (icon, name, description, unlocked date, global %), filter All / Unlocked / Locked, sort by unlock date or rarity. Hidden locked achievements show "Hidden achievement — keep playing to reveal it".
- **News**: list from `ISteamNews/GetNewsForApp`, opening in an in-app reader (sanitize HTML / BBCode).
- **Guides / Discussions**: Steam Community pages in a webview (same webview infrastructure as the Store/Community areas).
- **My notes**: free text, saved locally on blur/debounce. Never synced anywhere.
- **Store page ↗**: opens the store page in the Store webview.

## 5. Overview tab
Two columns (≈ 1.55fr / 1fr, gap 28px).

Left column:
- **Activity** — friend events for this game, newest first (max 3, "See more" if more). Achievement events show up to 2 mini achievement tiles (icon or "?" for hidden).
- **News** — latest item as a card (image 160×90, date, title, 2-line excerpt). Image fallback: the game's cover.

Right column:
- **Achievements** card:
  - **Next up**: the locked achievement with the **highest global unlock %** (the most attainable one); skip hidden ones unless all remaining are hidden.
  - 32-cell style grid: one cell per achievement, unlocked = accent, locked = `--surface-3`. For games with > 64 achievements, show a progress bar instead of cells.
  - "See all N achievements →" switches to the Achievements tab.
- **Tags** card:
  - Chips for genre + modes + tags. "**+ Edit tags**" toggles an inline editor with three rows (Genre / Mode / Vibe) of toggle chips. Edits are saved locally as user overrides (see `STEAM_INTEGRATION.md` §5) and immediately update the library.
  - "**Appears in:**" line listing every smart shelf and mood whose rule matches this game, computed with the same `matches(game, rule)` engine as the library. Live-updates while editing.

## 6. More like this
- Up to 7 covers from the user's own library, ranked by number of shared tags (genre + modes + tags), excluding the current game; tie-break by most recently played. Each card shows the top 3 shared tags as its sub-line.
- Hide the section if fewer than 2 results.

## a11y / quality checklist
- Heading order: logo (alt = name) → section H2s. Hero background `alt=""`.
- Icon-only buttons have `aria-label`; favorite uses `aria-pressed`; tag editor toggle uses `aria-expanded`.
- Keyboard: Tab order follows layout; Esc goes back to the library.
- No layout shift when async blocks load (reserve heights with skeletons).
- Never show invented values: unknown → hide or show a neutral dash.
