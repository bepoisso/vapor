# Releasing Vapor

Releases are built by GitHub Actions (`.github/workflows/release.yml`) from a version tag. The workflow builds the Windows installers (NSIS `.exe`, MSI), signs the updater artifacts, and opens a **draft** release with them and `latest.json` (the manifest installed copies check for updates). Nothing is public until the draft is published.

## One-time setup: the updater signing key

Installed copies only accept updates signed with Vapor's key. Generate it once, on the owner's machine:

```sh
pnpm tauri signer generate -w ~/.tauri/vapor.key
```

It asks for a password and writes `~/.tauri/vapor.key` (private) and `~/.tauri/vapor.key.pub` (public).

1. Put the content of `vapor.key.pub` in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` and commit it (it is public).
2. Add two repository secrets (GitHub → Settings → Secrets and variables → Actions), or with the GitHub CLI:
   ```sh
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/vapor.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```
3. Back up the private key and its password somewhere safe. **If they are lost, installed copies can no longer be updated** (users would have to reinstall by hand).

Never commit the private key. To build installers locally, set `TAURI_SIGNING_PRIVATE_KEY` (path or content) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` before `pnpm tauri build`; without them, use `pnpm tauri build --no-bundle`.

## Each release

1. Update the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (then `cargo check` to refresh `Cargo.lock`), and add a section to `CHANGELOG.md`.
2. Merge to `main`, then tag and push:
   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The workflow fails if the tag and the `tauri.conf.json` version differ.
3. When the workflow is done, open the draft release on GitHub, check the assets (`Vapor_<version>_x64-setup.exe`, `.msi`, their `.sig` files, `latest.json`), install the `.exe` once, and publish.

Updates reach installed copies through `https://github.com/bepoisso/vapor/releases/latest/download/latest.json`, i.e. the latest **published** release.

## Code signing (optional, later)

The installers are not Authenticode-signed, so Windows SmartScreen warns on first launch until the app builds reputation. Signing needs a code-signing certificate (or Azure Trusted Signing); Tauri's `bundle.windows.signCommand` / `certificateThumbprint` settings take it.
