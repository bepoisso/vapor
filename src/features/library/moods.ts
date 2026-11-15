import { Book, Clock, Coffee, Compass, type LucideIcon, Sparkles, Star, Users } from "lucide-react";
import type { Translate } from "@/i18n";
import type { Field, Rule, Shelf } from "@/lib/bindings";

export const MOOD_IDS = ["friends", "story", "hard", "chill", "quick", "explore"] as const;
export type MoodId = (typeof MOOD_IDS)[number];
export const DEFAULT_MOOD_ID: MoodId = "friends";

export interface Mood {
  id: MoodId;
  icon: LucideIcon;
  rule: Rule;
}

const anyOf = (field: Field, ...values: string[]): Rule => ({
  match: "all",
  conditions: [{ field, values }],
});

/** Default moods (`docs/LIBRARY_SPEC.md` §4). Labels: `mood.moods.<id>` in the locale file. */
export const MOODS: readonly Mood[] = [
  { id: "friends", icon: Users, rule: anyOf("modes", "Coop", "PvP") },
  { id: "story", icon: Book, rule: anyOf("tags", "Story") },
  { id: "hard", icon: Star, rule: anyOf("tags", "Hard") },
  { id: "chill", icon: Coffee, rule: anyOf("tags", "Chill") },
  { id: "quick", icon: Clock, rule: anyOf("tags", "Short sessions") },
  { id: "explore", icon: Compass, rule: anyOf("tags", "Exploration") },
];

/** A pill of "In the mood for…": a default mood, or a shelf shown as a mood. */
export interface MoodOption {
  id: string;
  label: string;
  icon: LucideIcon;
  rule: Rule;
}

/** The default moods, then the smart shelves marked "Show as mood", in shelf order. */
export function moodOptions(shelves: readonly Shelf[], t: Translate): MoodOption[] {
  return [
    ...MOODS.map((mood) => ({ ...mood, label: t(`mood.moods.${mood.id}`) })),
    ...shelves
      .filter((shelf) => shelf.showAsMood && shelf.kind === "smart" && shelf.rule)
      .map((shelf) => ({
        id: `shelf:${shelf.id}`,
        label: shelf.name,
        icon: Sparkles,
        rule: shelf.rule ?? { match: "all" as const, conditions: [] },
      })),
  ];
}
