import type { Game } from "@/lib/bindings";
import { parseIsoDate } from "./dates";

/** "Recently added" needs acquisition dates, which come with real Steam data (Phase 2+). */
export const SORT_KEYS = ["name", "lastPlayed", "playtime"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const byName = (a: Game, b: Game) => collator.compare(a.name, b.name);

/** Descending, unknown values last, then by name. */
function byNumberDesc(value: (game: Game) => number | null) {
  return (a: Game, b: Game) => {
    const va = value(a);
    const vb = value(b);
    if (va === vb) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  };
}

const comparators: Record<SortKey, (a: Game, b: Game) => number> = {
  name: byName,
  lastPlayed: byNumberDesc((game) => parseIsoDate(game.lastPlayed)),
  playtime: byNumberDesc((game) => game.playtimeMinutes),
};

export function sortGames(games: readonly Game[], key: SortKey): Game[] {
  return [...games].sort(comparators[key]);
}

/** Most recently played first; games never played are excluded. */
export function recentlyPlayed(games: readonly Game[]): Game[] {
  return sortGames(
    games.filter((game) => game.lastPlayed !== null),
    "lastPlayed",
  );
}
