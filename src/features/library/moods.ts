import { Book, Clock, Coffee, Compass, type LucideIcon, Star, Users } from "lucide-react";
import type { Condition, Rule } from "@/lib/bindings";

export const MOOD_IDS = ["friends", "story", "hard", "chill", "quick", "explore"] as const;
export type MoodId = (typeof MOOD_IDS)[number];
export const DEFAULT_MOOD_ID: MoodId = "friends";

export interface Mood {
  id: MoodId;
  icon: LucideIcon;
  rule: Rule;
}

const tag = (value: string): Condition => ({ field: "tags", op: "includes", value });
const mode = (value: string): Condition => ({ field: "modes", op: "includes", value });

/** Default moods (`docs/LIBRARY_SPEC.md` §4). Labels: `mood.moods.<id>` in the locale file. */
export const MOODS: readonly Mood[] = [
  { id: "friends", icon: Users, rule: { any: [mode("Coop"), mode("PvP")] } },
  { id: "story", icon: Book, rule: { any: [tag("Story")] } },
  { id: "hard", icon: Star, rule: { any: [tag("Hard")] } },
  { id: "chill", icon: Coffee, rule: { any: [tag("Chill")] } },
  { id: "quick", icon: Clock, rule: { any: [tag("Short sessions")] } },
  { id: "explore", icon: Compass, rule: { any: [tag("Exploration")] } },
];
