# Context

## The problem
The official Steam client is slow, heavy and cluttered. Its library page mixes news, recommendations and a dense list with poor hover states. Most of the time, people open it just to launch a game.

## The product
**Vapor** is an open-source desktop app, published on GitHub, that people can download, connect to their Steam account, and use to browse and launch their games without having to deal with the Steam UI.

Main areas (same as Steam's top navigation):
1. **Library** — the home page. *In scope now.*
2. **Store** — a webview of the Steam store. *Later.*
3. **Community** — a webview of Steam Community. *Later.*
4. **Profile** — the user's profile (persona name in the top bar). *Later.*
5. **Game page** — opened from any game card. *Next design iteration; not designed yet. Don't build beyond a placeholder route.*

## Who it's for
PC players with medium to large Steam libraries (the author has 85 favorites) who want speed, a clean UI, and better ways to pick what to play.

## Design direction (approved)
Codename **Nebula**. Dark, image-led, calm:
- A big hero banner of the game you were last playing, with its real logo, stats and a yellow **Play** button.
- Real Steam art everywhere (covers, heroes, logos) — the UI recedes, the games stand out.
- A single accent color (yellow `#FFD43B`) used only for primary actions and active states.
- No left-hand game list like Steam: the library is a page you scroll, not a tree.

## The library concept (approved "Mix A")
Categories should not depend only on hand-made collections. The page combines three ideas:
1. **Smart shelves** — rows that fill themselves from rules (e.g. *Indie AND Hard*). Users can create their own.
2. **Mood picker** ("No idea? In the mood for…") — one-click moods mapped to rules, showing 4 suggestions. Secondary feature: it sits mid-page, not at the top.
3. **Facet filters** — Genre / Mode / Vibe chips that filter the full library grid live, with counts. A filter combination can be saved as a smart shelf.

Explicitly rejected during design: a keyboard query language with saved "views" and "group by" tabs (variant N4). Don't add it.

## Non-goals (for now)
- Replacing Steam's download/update engine. Installs and updates are delegated to Steam.
- Running games without Steam. Steam-DRM games need the Steam client running in the background; Vapor launches through it (see `STEAM_INTEGRATION.md`).
- Store, community, chat, friends list.

## Owner
Benjamin (GitHub/42 login: `bepoisso`), developer, comfortable with React/TypeScript, interested in systems and backend work. Communicates in French; all project artifacts are in English.
