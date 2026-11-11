# Vapor — Handoff package

Vapor is an open-source desktop client for Steam. It replaces the Steam client as the place where you browse your library and launch games, with a faster and better-designed UI.

This package is the design-to-code handoff for the **Library page**. It is everything needed to start the project with Claude Code.

## How to use this package

1. Create an empty repo (e.g. `vapor`) and copy this whole folder into it.
2. Open Claude Code at the repo root and start with:

   > Read `CLAUDE.md` and everything in `docs/`, open `mockups/library.html` to see the target, then follow Phase 0 and Phase 1 of `docs/ROADMAP.md`. Ask me before choosing anything that the docs leave open.

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | Working rules for Claude Code in this repo (read first) |
| `docs/CONTEXT.md` | Product context, goals, users, non-goals, decisions already made |
| `docs/LIBRARY_SPEC.md` | Functional spec of the Library page, section by section |
| `docs/DESIGN_SYSTEM.md` | Tokens (colors, type, spacing, radii, motion) and components |
| `docs/STEAM_INTEGRATION.md` | How to read the library, images and stats from Steam, and how to launch games |
| `docs/ROADMAP.md` | Phased plan with acceptance criteria |
| `mockups/library.html` | **The approved design**, as a working static page (open it in a browser) |
| `mockups/data/games.sample.json` | Sample data model used by the mockup |
| `mockups/assets/` | Game images taken from the author's local Steam cache, named like Steam names them |

## Important

- The images in `mockups/assets/` are copyrighted by their publishers. They come from a local Steam cache and are **for local reference only**: do not commit them to a public repository (see `.gitignore` suggestion in `CLAUDE.md`). The real app reads these images from the user's own Steam install at runtime.
- In the mockup, only **Celeste** has real stats (46.8 h, last played Jan 6, 18/32 achievements). All other values and all tags are sample data.
