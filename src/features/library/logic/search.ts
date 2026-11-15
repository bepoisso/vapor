import type { Game } from "@/lib/bindings";

/** Lowercase, accents stripped: "Pokémon" matches "pokemon". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Normalized names, computed once per game object (games are immutable snapshots). */
const normalizedNames = new WeakMap<Game, string>();

function normalizedName(game: Game): string {
  let name = normalizedNames.get(game);
  if (name === undefined) {
    name = normalizeText(game.name);
    normalizedNames.set(game, name);
  }
  return name;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * Top bar search: games whose name contains the query (case- and accent-insensitive). Names
 * starting with it come first, then names with a word starting with it, then the rest; A–Z
 * within each group.
 */
export function searchGames(games: readonly Game[], query: string, limit = 8): Game[] {
  const needle = normalizeText(query);
  if (!needle) return [];
  const ranked: { game: Game; rank: number }[] = [];
  for (const game of games) {
    const name = normalizedName(game);
    const index = name.indexOf(needle);
    if (index < 0) continue;
    const wordStart = index > 0 && !/[\p{L}\p{N}]/u.test(name.charAt(index - 1));
    ranked.push({ game, rank: index === 0 ? 0 : wordStart ? 1 : 2 });
  }
  ranked.sort((a, b) => a.rank - b.rank || collator.compare(a.game.name, b.game.name));
  return ranked.slice(0, limit).map((entry) => entry.game);
}
