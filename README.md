# Vapor

**A fast, open-source desktop client for your Steam library.**

Vapor replaces the Steam client as the place where you browse your games and launch them. It reads your library straight from your Steam install, shows it with your games' real artwork, and helps you pick what to play: smart shelves that fill themselves, a mood picker, live filters and a page for every game.

> **Status: first release (0.1).** Windows only for now. Expect rough edges, and please [report them](https://github.com/bepoisso/vapor/issues).

## Install

1. Download `Vapor_<version>_x64-setup.exe` from the [latest release](https://github.com/bepoisso/vapor/releases/latest).
2. Run it. It installs for your Windows account only, no administrator rights needed.
3. **Windows SmartScreen may warn you** the first time ("Windows protected your PC"): the installer isn't code-signed yet. Choose **More info**, then **Run anyway**.

Vapor updates itself: when a new version is out it offers to install it (Settings → Updates). Updates are checked against Vapor's signing key before being installed.

Requirements: Windows 10 or 11 (64-bit), and **Steam installed**. Vapor uses Microsoft Edge WebView2, which Windows 11 already has; on Windows 10 the installer downloads it if needed.

## What Vapor is, and what it isn't

- Vapor replaces Steam's **interface**, not the Steam **client**. Most games use Steam DRM and need Steam running, so Vapor starts Steam silently in the tray and launches games through it. You won't see the Steam window; Steam still shows its own small "launching" notice.
- Installs and updates are still done by Steam. Vapor just asks Steam to do them (Steam shows its install dialog).
- Vapor **never asks for your Steam password**. It reads local Steam files. Optionally, paste your own [Steam Web API key](https://steamcommunity.com/dev/apikey) in Settings to see every game you own (not only installed ones), your achievements and your friends; the key is kept in Windows Credential Manager and only ever sent to Steam.
- Genres and modes come from the Steam Store when you turn that on in Settings (off by default: Valve doesn't document the Store endpoint Vapor uses).
- Your shelves, tags, favorites and notes stay on your computer. Vapor never writes Steam's files.
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

The reference mockups (`mockups/*.html`) use game art from a local Steam cache, which is not in this repository. Opening them without `mockups/assets/` shows empty images.

### Releasing

See [`docs/RELEASING.md`](docs/RELEASING.md): bump the version, push a `v<version>` tag, and the release workflow drafts a GitHub release with the installers and the signed update manifest.

## License

[MIT](LICENSE)
