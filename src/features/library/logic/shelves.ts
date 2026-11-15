import type { Game, Shelf } from "@/lib/bindings";
import { matchesRule } from "./rules";
import { sortGames } from "./sorting";

/** Pinned shelves first, each group in its saved order. */
export function displayOrder(shelves: readonly Shelf[]): Shelf[] {
  return [...shelves.filter((shelf) => shelf.pinned), ...shelves.filter((shelf) => !shelf.pinned)];
}

/**
 * The games of a shelf: a smart shelf's matches, the hand-picked or Steam ones (most recently
 * played first), without not-installed games when the shelf hides them. `null` when unknown
 * (a Steam collection that is gone or not read yet): show "—", never a made-up count.
 */
export function shelfGames(
  shelf: Shelf,
  games: readonly Game[],
  now: number = Date.now(),
): Game[] | null {
  let members: Game[];
  if (shelf.kind === "smart") {
    const rule = shelf.rule ?? { match: "all", conditions: [] };
    members = games.filter((game) => matchesRule(game, rule, now));
  } else {
    if (!shelf.appIds) return null;
    const byId = new Map(games.map((game) => [game.appId, game]));
    members = sortGames(
      shelf.appIds.flatMap((appId) => byId.get(appId) ?? []),
      "lastPlayed",
    );
  }
  return shelf.hideNotInstalled ? members.filter((game) => game.installed !== false) : members;
}

export interface LibraryShelf {
  shelf: Shelf;
  games: Game[];
}

/**
 * The rows of the library page: visible shelves in display order. A default shelf the user
 * never edited hides while empty; the user's own shelves always show, so they can be fixed.
 */
export function libraryShelves(
  shelves: readonly Shelf[],
  games: readonly Game[],
  now: number = Date.now(),
): LibraryShelf[] {
  return displayOrder(shelves)
    .filter((shelf) => shelf.visible)
    .map((shelf) => ({ shelf, games: shelfGames(shelf, games, now) ?? [] }))
    .filter(
      (entry) => entry.games.length > 0 || (entry.shelf.kind === "smart" && !entry.shelf.seeded),
    );
}

/** "Coop · Indie": the default name of a shelf made from these values. */
export function autoName(values: readonly string[]): string {
  return values.join(" · ");
}
