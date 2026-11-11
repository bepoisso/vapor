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

export function filterByName(games: readonly Game[], query: string): readonly Game[] {
  const needle = normalizeText(query);
  if (!needle) return games;
  return games.filter((game) => normalizedName(game).includes(needle));
}
