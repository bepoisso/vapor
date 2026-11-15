# Changelog

## 0.1.0 — first release

Vapor's first public version, for Windows.

### Library
- Your Steam library, read from your Steam install (every drive), with your games' real artwork, playtime and last played. Opens from Vapor's cache in a fraction of a second; Steam is rescanned in the background.
- "Continue" banner, Recently played, "No idea? In the mood for…" moods, smart shelves, and the full library with genre / mode / vibe filters and sorting.
- Search from the top bar (`Ctrl K`): results show under the field; pick one to open its page.
- Play and Install go through Steam, which starts silently in the tray.
- With your own Steam Web API key (optional): every game you own, achievements and friends.
- Genres and modes from the Steam Store (optional, off by default), vibe tags you can edit.

### Game page
- Big banner with Play (Install, Update, Launching…, Running · Stop), favorite, and Steam actions (properties, browse files, verify, uninstall, hide from library).
- Playtime, last session, achievements and friends at a glance.
- Overview with friends' activity, the latest news, your next achievement, editable tags ("Appears in" shows the shelves and moods that include the game) and "More like this" from your library.
- Achievements list, news reader, Steam guides and discussions, and personal notes.

### Smart shelves
- Shelves that fill themselves from a rule (any genre / mode / vibe, playtime, last played, installed, achievements), Favorites, and your Steam collections (read-only).
- A page for each shelf, with live rule editing and "Almost in" (games one criterion away).
- A full-page shelf builder with a live preview, "Save as shelf" from the library filters, and "My shelves" to order, show, hide, pin and rename them.

### Known limitations
- Windows only. The installer isn't code-signed yet, so Windows SmartScreen may warn on first launch.
- Steam must be installed; most games need it running (Vapor starts it in the tray).
- Guides, discussions and the Store open in your browser.
