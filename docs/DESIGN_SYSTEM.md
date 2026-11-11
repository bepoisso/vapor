# Design system — Nebula

All values below are used in `mockups/library.html` (see the `:root` block). Implement them as CSS custom properties and reference them by name.

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0B0F` | App background |
| `--surface` | `#121218` | Panels (mood module, facet box) |
| `--surface-2` | `#18181F` | Chips, pills, image placeholders |
| `--surface-3` | `#1E1E26` | Dividers, subtle fills |
| `--border` | `#1E1E26` | Panel borders |
| `--border-strong` | `#2A2A33` | Chip/pill borders |
| `--text` | `#F4F4F6` | Primary text |
| `--text-2` | `#C9C9D1` | Secondary text on images, nav items |
| `--text-muted` | `#9B9BA6` | Labels, counts, meta (≥ 4.5:1 on `--bg`) |
| `--accent` | `#FFD43B` | Primary buttons, active chips/pills, focus ring, hover title |
| `--accent-ink` | `#0B0B0F` | Text/icons on accent |

Rules:
- Accent is reserved for **primary action + active state**. Never decorative.
- Text over images always sits on a scrim (see Hero, Wide card).
- Placeholder avatar color in mockup: `#6C4FD1` (replace with the real Steam avatar).

## Typography
- Family: **Geist** (Google Fonts), fallback `system-ui, sans-serif`. Bundle it locally in the app (no runtime CDN).
- Scale used:

| Role | Size / weight | Notes |
|---|---|---|
| Section title (H2) | 22px / 700 | letter-spacing −0.02em |
| Shelf / module title (H3) | 20px / 700 | |
| Body / buttons | 14px / 500–700 | Play button 15px / 700 |
| Card title | 13px / 600 (12px in dense grid) | single line, ellipsis |
| Meta, chips | 12–13px / 500 | |
| Kicker / facet labels | 11–12px / 600, uppercase, letter-spacing .08–.1em | |

## Spacing & layout
- Page horizontal padding: **48px** (`--page-x`); top bar 32px.
- Section gap: 36px between sections (44px before Library); 14px between a section title and its content.
- Grids: 7 columns for shelves and "Recently played" (gap 18px); 10 columns for the full library grid (gap 16px row / 14px column); 4 columns for mood suggestions (gap 14px).
- Reference width: 1440px. The grid column counts should adapt (auto-fill with a min card width ≈ 150px for shelves, ≈ 110px for the dense grid) — the mockup uses fixed counts for clarity.

## Radii
`--radius-sm` 9px (small buttons, nav items) · `--radius-md` 12px (buttons, inputs) · `--radius-lg` 14px (cover art) · `--radius-xl` 18px (facet box) · `--radius-2xl` 22px (mood module) · pills/chips: 999px · dense-grid covers: 10px · wide cards: 16px.

## Motion
- Easing: `cubic-bezier(.2,.8,.2,1)` (`--ease-out`).
- Cover hover: translateY(−6px) + shadow `0 22px 40px rgba(0,0,0,.55)`, 250ms. Title turns accent.
- Wide card hover: image scale(1.05), 350ms.
- Chip/pill hover: border turns accent, 150ms.
- Respect `prefers-reduced-motion`: disable transforms, keep color changes.

## Components

**Top bar** — logo "vapor" (two-wave mark, top wave accent) · segmented nav (Store / Library / Community; active = light pill) · centered search (380px, `Ctrl K` hint) · profile button (persona name + avatar). Sits on top of the hero with translucent black fills (`rgba(0,0,0,.4)`).

**Hero** — full-width, 480px tall. Background = `library_hero.jpg` (`object-position: center 30%`). Two scrims: vertical (dark top 0–22%, clear, dark from 45% to bg at 100%) and horizontal (dark left → clear at 55%). Content bottom-left: kicker, game logo (`logo.png`, max 140px tall / 460px wide; fall back to the game name as text if no logo), Play + Game page buttons, stats line.

**Cover card** — 2:3 `library_600x900.jpg`, radius 14px, title below, optional sub-line (muted). Whole card is a link to the game page.

**Wide card** — 170px tall, hero image cropped, bottom scrim, title + genre/mode line, round yellow play button (36px) on the right.

**Pill (mood)** — 36px, icon + label, toggle (`aria-pressed`). Active = accent fill.

**Chip (facet)** — 30px, label + count at 60% opacity, toggle (`aria-pressed`). Disabled when count = 0 and not selected.

**Rule badge** — small pill next to a shelf title: sparkle icon (accent) + rule summary (e.g. "Indie + Hard").

**Buttons** — primary (accent fill), ghost (white 12% → 18% on hover), small (bordered), small-accent, dashed ("+ Create a smart shelf").

Icons: simple 2px stroke line icons (24px grid). Use Lucide (`lucide-react`) in the app; the mockup inlines equivalent SVG paths.
