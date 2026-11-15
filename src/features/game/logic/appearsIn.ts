import type { Game, Rule, Shelf } from "@/lib/bindings";
import { matchesRule } from "@/features/library/logic/rules";

export interface Place {
  kind: "shelf" | "mood";
  name: string;
}

interface NamedRule {
  name: string;
  rule: Rule;
}

/**
 * Every smart shelf (shown or not) and mood whose rule matches the game, with the library's own rule engine,
 * so the line agrees with what the library shows.
 */
export function appearsIn(
  game: Game,
  shelves: readonly Shelf[],
  moods: readonly NamedRule[],
  now: number,
): Place[] {
  return [
    ...shelves
      .filter((shelf) => shelf.kind === "smart" && shelf.rule && matchesRule(game, shelf.rule, now))
      .map((shelf): Place => ({ kind: "shelf", name: shelf.name })),
    ...moods
      .filter((mood) => matchesRule(game, mood.rule, now))
      .map((mood): Place => ({ kind: "mood", name: mood.name })),
  ];
}
