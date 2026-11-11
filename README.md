# Vapor

**A fast, open-source desktop client for your Steam library.**

Vapor replaces the Steam client as the place where you browse your games and launch them. It reads your library straight from your Steam install, shows it with your games' real artwork, and helps you pick what to play: smart shelves that fill themselves, a mood picker and live filters.

> **Status: early development.** Nothing to download yet. Follow the [roadmap](docs/ROADMAP.md).

## What Vapor is, and what it isn't

- Vapor replaces Steam's **interface**, not the Steam **client**. Most games use Steam DRM and need Steam running, so Vapor starts Steam silently in the tray and launches games through it. You won't see the Steam window.
- Installs and updates are still done by Steam. Vapor just asks Steam to do them.
- Vapor **never asks for your Steam password**. It reads local Steam files, and optionally uses your own Steam Web API key, stored in your OS keychain.
- Not affiliated with Valve. Steam and the Steam logo are trademarks of Valve Corporation.

## Platforms

Windows first. Linux and macOS later.

## Development

Prerequisites: [Rust](https://rustup.rs) (stable, MSVC toolchain on Windows), Node.js 22+, [pnpm](https://pnpm.io) 10, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install
pnpm tauri dev      # run the app
pnpm test           # frontend tests
pnpm lint && pnpm typecheck
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Stack: [Tauri 2](https://v2.tauri.app) (Rust) + React 19 + TypeScript + Vite. See [`CLAUDE.md`](CLAUDE.md) for conventions and [`docs/`](docs) for the product context, design system and Steam integration notes.

The reference mockup (`mockups/library.html`) uses game art from a local Steam cache, which is not in this repository. Opening it without `mockups/assets/` shows empty images.

## License

[MIT](LICENSE)
