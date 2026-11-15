import type { Game } from "@/lib/bindings";
import { parseIsoDate } from "@/features/library/logic/dates";

/** Genre, modes and tags of a game, in that order, without duplicates. */
export function classificationValues(game: Game): string[] {
  return [...new Set([...(game.genre ? [game.genre] : []), ...game.modes, ...game.tags])];
}

export interface SimilarGame {
  game: Game;
  /** Values shared with the current game, in the current game's order. */
  shared: string[];
}

/**
 * "More like this" (`docs/GAME_PAGE_SPEC.md` §6): games of the user's library ranked by the
 * number of shared values (genre + modes + tags), then by most recently played.
 */
export function moreLikeThis(game: Game, library: readonly Game[], limit = 7): SimilarGame[] {
  const values = classificationValues(game);
  return library
    .filter((other) => other.appId !== game.appId)
    .map((other) => {
      const theirs = new Set(classificationValues(other));
      return { game: other, shared: values.filter((value) => theirs.has(value)) };
    })
    .filter((entry) => entry.shared.length > 0)
    .sort(
      (a, b) =>
        b.shared.length - a.shared.length ||
        (parseIsoDate(b.game.lastPlayed) ?? -Infinity) -
          (parseIsoDate(a.game.lastPlayed) ?? -Infinity),
    )
    .slice(0, limit);
}
