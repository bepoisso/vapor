# Library page — functional spec

Reference: `mockups/library.html`. Sections appear top to bottom in this order.

## 0. Data model (what the UI consumes)

```ts
type AppId = number;

interface Game {
  appId: AppId;
  name: string;
  genre: string;                 // primary genre (one)
  modes: Array<'Solo' | 'Coop' | 'PvP'>;
  tags: string[];                // vibe tags: Indie, Hard, Story, Chill, Action, Competitive, Exploration, Short sessions…
  installed?: boolean;
  playtimeMinutes?: number;
  lastPlayed?: string;           // ISO date
  achievements?: { unlocked: number; total: number };
  cloud?: 'synced' | 'pending' | 'conflict' | 'unknown';
  updatePending?: boolean;
  images: { cover?: string; hero?: string; logo?: string }; // local file URLs resolved by the backend
}

type Field = 'genre' | 'modes' | 'tags' | 'installed' | 'playtimeMinutes' | 'lastPlayed' | 'achievementsPct';
interface Condition { field: Field; op: 'includes' | 'eq' | 'lt' | 'gt' | 'olderThanDays'; value: string | number | boolean }
interface Rule { all?: Condition[]; any?: Condition[] }   // all = AND, any = OR; both may be set

interface SmartShelf { id: string; title: string; rule: Rule; order: number; pinned?: boolean }
interface Mood { id: string; label: string; icon: string; rule: Rule }
```

`mockups/data/games.sample.json` shows concrete examples. One rule engine (`matches(game, rule)`) serves shelves, moods and "save filters as shelf".

## 1. Top bar (over the hero)
- Logo · nav (Store / **Library** / Community) · search · profile.
- Search: filters by name as you type; `Ctrl K` focuses it. For v1, typing scrolls to the Library section and applies a name filter on top of facet filters. (A full command palette can come later.)
- Store / Community: route placeholders for now.

## 2. Hero — "Continue"
- Shows the **most recently played** game (highest `lastPlayed`).
- Kicker: "Continue · Last played {date}". Logo image (fallback: name as text). Buttons: **Play** (launch), **Game page** (navigate). Stats line: playtime · achievements · cloud status — only show values that are known.
- If the game isn't installed: primary button becomes **Install** (delegated to Steam, see integration doc).

## 3. Recently played
- 7 covers, sorted by `lastPlayed` desc, excluding nothing (the hero game appears first). "History →" link (future page).

## 4. Mood module — "No idea? In the mood for…"
- Six default moods (editable later): Play with friends (Coop OR PvP) · A story (Story) · A challenge (Hard) · Unwind (Chill) · A quick game (Short sessions) · Explore (Exploration).
- Exactly one mood active at a time; default = first. Selecting a mood shows **4 wide cards** of matching games.
- Ordering of suggestions: prefer installed games, then games not played recently, then random tie-break with a stable seed per day (so it doesn't reshuffle on every render). Add a small "Another idea ↻" control later if wanted.
- Each wide card: click = game page, round button = Play.

## 5. Smart shelves
- Each shelf: title, rule badge (human-readable rule summary), "See all (n) →", then a row of up to 7 covers.
- Default shelves (seeded on first run): Demanding indies (Indie AND Hard) · Big stories (Story) · Online (PvP).
- Hide a shelf that has 0 matches.
- "+ Create a smart shelf" opens a rule builder (v1 can be a simple modal: title + list of conditions + AND/OR toggle + live preview count). Persist shelves locally (JSON in the app data dir).
- Later: reorder, rename, delete, pin.

## 6. Library (full grid + facets)
- Header: "Library", live count ("n games"), **Clear all** and **Save as shelf** (only visible when filters are active), sort button (A–Z default; also Recently played, Playtime, Recently added).
- Facet box with three facets: **Genre**, **Mode**, **Vibe**. Values come from the data (Genre: distinct genres; Mode: Solo/Coop/PvP; Vibe: tag list).
- Logic: **OR within a facet, AND across facets.** Each chip shows how many games it would yield given the *other* facets' selections. Chips with 0 results (and not selected) are disabled.
- Grid: 10 columns at 1440px (auto-fill in the app), cover + title. Empty state text when nothing matches.
- **Save as shelf** converts the current selection into a `Rule` (each facet → an `any` group; facets combined with `all`) and opens the shelf naming dialog.
- Must stay fast with 1,000+ games: virtualize the grid.

## Interaction & a11y checklist
- All cards are links; Play buttons are buttons. Keyboard: Tab order follows visual order; Enter on a card opens the game page.
- Chips and pills use `aria-pressed`. Focus ring = 2px accent outline, offset 2px.
- Images: decorative backgrounds get `alt=""`; logos get the game name as alt.
- Hover effects are not required to discover any feature.

## Out of scope for this iteration
Game page design, Store/Community webviews, profile page, friends/chat, download management UI.
