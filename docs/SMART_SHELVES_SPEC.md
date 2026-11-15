# Smart shelves — functional spec

Extends `LIBRARY_SPEC.md` §5 (smart shelves) and §6 ("Save as shelf"). Same design system (`DESIGN_SYSTEM.md`).
Mockups (open in a browser; they need `mockups/assets/` from the first package):

| Screen | Mockup | Route | Opened from |
|---|---|---|---|
| S1 · Shelf page | `mockups/shelf.html` | `/shelf/:id` | "See all (n) →" on a library shelf; a rule badge |
| S2 · Shelf builder | `mockups/shelf-builder.html` | `/shelves/new`, `/shelves/:id/edit` | "+ Create a smart shelf", "+ New shelf", edit buttons, "Edit in detail →" |
| S3 · Manage shelves | `mockups/shelves-manage.html` | `/shelves` | "Manage order" link in the library, settings |
| S4 · Save filters as shelf | `mockups/shelf-save-dialog.html` | dialog over `/library` | "Save as shelf" in the library facet box |

Shared mockup logic (data, rule engine, labels) is in `mockups/shelves-common.js`; it is a reference for the TypeScript implementation, not code to copy as-is.

## 0. Data model

This **replaces** the `Rule` / `SmartShelf` types of `LIBRARY_SPEC.md` §0 (the earlier `{ all?, any? }` shape). Migrate the library code to this one.

```ts
type FieldId = 'genre' | 'modes' | 'tags'                       // available now (sample data / Steam genres+categories)
             | 'playtime' | 'lastPlayed' | 'installed' | 'achievementsPct'; // need Steam data (Phase 4)

interface Condition {
  field: FieldId;
  values: string[];          // set fields: game passes if it has ANY of these values (OR inside a condition)
  op?: 'gt' | 'lt' | 'olderThanDays' | 'is';  // numeric/date/bool fields only
  value?: number | boolean;                   // numeric/date/bool fields only
}
interface Rule { match: 'all' | 'any'; conditions: Condition[] }  // conditions combined with AND ('all') or OR ('any'); empty conditions are ignored

type ShelfKind = 'smart' | 'manual' | 'steam';
interface Shelf {
  id: string;
  name: string;
  kind: ShelfKind;
  rule?: Rule;               // smart only
  appIds?: number[];         // manual only (e.g. Favorites)
  steamCollectionId?: string;// steam only — imported read-only, re-synced on launch
  visible: boolean;          // shown on the library page
  pinned: boolean;           // pinned shelves come first, in their own order
  order: number;
  showAsMood?: boolean;      // also exposed as a pill in "In the mood for…"
  hideNotInstalled?: boolean;
  createdAt: string; updatedAt: string;
}
```

Engine (pure TS, unit-tested — reuse it everywhere: library shelves, moods, facets "save", game page "Appears in"):
- `matches(game, rule): boolean`
- `almostMatches(games, rule): Array<{ game, missing: Condition }>` — games failing **exactly one** active condition of an `all` rule with ≥ 2 active conditions.
- `ruleLabel(rule)` — short badge text: values joined by ` or `, conditions by ` + ` (all) or ` | ` (any). Example: `Indie + Hard`.
- `ruleSentence(rule)` — readable sentence: "Games whose mode is Coop or PvP, and whose vibe is Indie."
- `facetsToRule(selection)` — one condition per facet with selected values, `match: 'all'`.

Persistence: local JSON/SQLite in the app data dir (`shelves` table/file). Default shelves are seeded on first run (see `mockups/data/shelves.sample.json`). Steam collections are never written back to Steam.

## 1. S1 · Shelf page (`/shelf/:id`)
- **Banner** (380px): the hero images of the first 4 matching games side by side, dimmed + vertical scrim. Back to Library (restores scroll/filters), profile.
- Bottom-left: kicker "SMART SHELF" (sparkle, accent) · shelf name (56px / 800) · "n games · updates itself". For manual shelves: kicker "SHELF", sub "n games".
- Bottom-right: **Pinned** toggle · **Play a random one** (primary): launches a random installed game of the shelf (skip not-installed; disable if none).
- **Rule bar** (smart only): conditions as removable chips (`Field value ×`) joined by AND/OR, then "+ Add:" quick chips for unused tag/mode values. Changes apply live **and** are saved (show a small "Saved" toast with Undo). "Sort" menu: Last played (default), Name, Playtime, Recently added.
- **Grid**: 6 columns at 1440px (auto-fill ≥ 180px), cover + name + meta line (playtime · last played if known, else genre). Empty state when nothing matches.
- **Almost in** (smart, `all` rules with ≥ 2 conditions): up to 8 desaturated covers with "missing: <value>". Clicking one opens the game page; a later iteration can add a one-click "Add tag" there.

## 2. S2 · Shelf builder (`/shelves/new`, `/shelves/:id/edit`)
Full page, two columns (540px form | live preview).
- Header: **Cancel** (confirm if dirty) · title "New smart shelf" / "Edit shelf" · **Save as mood** (creates/updates with `showAsMood: true`) · **Create shelf** / **Save** (primary, disabled while the name is empty).
- **Name**: text input, autofocus, required, unique (warn on duplicate).
- **Match**: segmented `All conditions (AND)` / `Any condition (OR)`.
- **Conditions**: one block per field — header "<Field> is any of" + remove ×, then toggle chips for every value of that field (values come from the user's library data). Between blocks: AND/OR joiner in accent.
- "+ <Field>" buttons for fields not used yet. Fields that need Steam data (Playtime, Last played, Installed, Achievements %) are shown **disabled** until Phase 4 makes them available; then they get their own input (number + unit, date range, yes/no).
- **Display**: checkboxes Show in the library · Pin at the top · Hide games that aren't installed.
- **Live preview**: big count in accent, the rule sentence, empty state, grid of matching covers with a "why" line (which selected values each game matched).
- Keyboard: Ctrl+Enter = save, Esc = cancel.

## 3. S3 · Manage shelves (`/shelves`)
- Title "My shelves" + subtitle. Actions: **Import my Steam collections** (reads collections, creates `steam` shelves hidden by default) · **+ New shelf** (→ S2).
- Tabs: All · Smart · Manual · From Steam.
- **Row** per shelf: ▲▼ reorder (also drag & drop with a handle; keyboard: Alt+↑/↓) · fanned stack of 3 covers (spread on hover) · name + kind badge (Smart = accent, Manual = neutral, From Steam = blue `#8FB8FF`) + "Pinned" · sub-line (rule badge + count / "Added by hand · n games" / "Steam collection (read-only)") · **visibility switch** (`role="switch"`) · Edit (→ S2 for smart; rename dialog for manual; disabled for steam) · ⋯ menu (Rename, Duplicate, Pin/Unpin, Show as mood, Delete with confirm).
- Hidden shelves stay in the list at 55% opacity.
- **Library preview** (right, sticky): fixed blocks (Hero, Recently played, In the mood for…) then one highlighted block per **visible** shelf in final order (pinned first), then "Library + filters". Updates live.

## 4. S4 · Save filters as shelf (dialog)
Opened by "Save as shelf" when at least one facet chip is active.
- Modal (600px, radius 24px) over the dimmed/blurred library. Focus trapped; Esc, ×, Cancel and click on the veil close it.
- **Name**: prefilled with the selected values joined by " · " (e.g. "Coop · Indie"), selected for quick overwrite. Suggestion chips below (v1: the auto name + 2 static ideas; later: generated from the values).
- **Rule (from your filters)**: read-only chips from `facetsToRule(selection)` + "Edit in detail →" (opens S2 prefilled; keeps the dialog's name).
- **Preview**: count + up to 5 covers + a dashed card "New matching games are added automatically".
- **Where to show it**: 3 toggle cards — Library (as a row, default on) · In the mood for… (as a mood pill → `showAsMood`) · Pinned (top of the shelves).
- **Create shelf**: saves, closes, clears nothing (filters stay), shows a toast "Shelf created · View" linking to S1.

## Quality checklist
- All toggles expose state (`aria-pressed`, `aria-checked`, `aria-selected`); icon buttons have labels; focus ring = accent.
- Rule engine: 100% unit-tested (AND/OR, empty conditions ignored, almost-in, label/sentence, facets → rule).
- Editing a shelf, a game's tags (game page), or the library data recomputes every shelf without reload.
- Never invent counts: unknown counts (e.g. a Steam collection before sync) show as "—".
