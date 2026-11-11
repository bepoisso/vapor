import type { Condition, Game, Mode, Rule, RuleNode } from "@/lib/bindings";

/**
 * Library facets. Logic: OR within a facet, AND across facets. Each chip's count is the number
 * of games it would yield given the *other* facets' selections.
 */

export const FACET_KEYS = ["genre", "modes", "tags"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type FacetSelection = Readonly<Record<FacetKey, readonly string[]>>;

export const EMPTY_SELECTION: FacetSelection = { genre: [], modes: [], tags: [] };

const MODE_ORDER: readonly Mode[] = ["Solo", "Coop", "PvP"];

/** Vibe tags shown first, in this order (matches the mockup); other tags follow A–Z. */
const VIBE_ORDER = [
  "Indie",
  "Hard",
  "Story",
  "Chill",
  "Action",
  "Competitive",
  "Exploration",
  "Short sessions",
];

export interface Facet {
  key: FacetKey;
  values: readonly string[];
}

export function facetValues(game: Game, key: FacetKey): readonly string[] {
  switch (key) {
    case "genre":
      return game.genre ? [game.genre] : [];
    case "modes":
      return game.modes;
    case "tags":
      return game.tags;
  }
}

function countValues(games: readonly Game[], key: FacetKey): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const value of facetValues(game, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Facet values present in the library. Genres: most common first. */
export function buildFacets(games: readonly Game[]): Facet[] {
  const genres = [...countValues(games, "genre")]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([genre]) => genre);

  const tagSet = new Set(games.flatMap((game) => game.tags));
  const tags = [
    ...VIBE_ORDER.filter((tag) => tagSet.has(tag)),
    ...[...tagSet].filter((tag) => !VIBE_ORDER.includes(tag)).sort((a, b) => a.localeCompare(b)),
  ];

  return [
    { key: "genre", values: genres },
    { key: "modes", values: MODE_ORDER },
    { key: "tags", values: tags },
  ];
}

export function hasSelection(selection: FacetSelection): boolean {
  return FACET_KEYS.some((key) => selection[key].length > 0);
}

/** True if the game passes every facet's selection, optionally ignoring one facet. */
export function passesFacets(game: Game, selection: FacetSelection, skip?: FacetKey): boolean {
  return FACET_KEYS.every((key) => {
    if (key === skip) return true;
    const selected = selection[key];
    if (selected.length === 0) return true;
    const values = facetValues(game, key);
    return selected.some((value) => values.includes(value));
  });
}

export type FacetCounts = Readonly<Record<FacetKey, ReadonlyMap<string, number>>>;

export function facetCounts(games: readonly Game[], selection: FacetSelection): FacetCounts {
  const counts = (key: FacetKey) =>
    countValues(
      games.filter((game) => passesFacets(game, selection, key)),
      key,
    );
  return { genre: counts("genre"), modes: counts("modes"), tags: counts("tags") };
}

/** "Save as shelf": each facet becomes an OR group, facets are combined with AND. */
export function selectionToRule(selection: FacetSelection): Rule {
  const all: RuleNode[] = [];
  for (const key of FACET_KEYS) {
    const conditions = selection[key].map((value): Condition => ({
      field: key,
      op: "includes",
      value,
    }));
    if (conditions.length === 1 && conditions[0]) all.push(conditions[0]);
    else if (conditions.length > 1) all.push({ any: conditions });
  }
  return { all };
}
