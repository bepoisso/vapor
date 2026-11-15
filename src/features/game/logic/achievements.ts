import type { AchievementList, Game } from "@/lib/bindings";
import type { Load } from "../store/gameStore";

/** Achievement counts: the full list once loaded, else the library's counts. */
export function achievementCounts(
  game: Game,
  achievements: Load<AchievementList | null>,
): { unlocked: number; total: number } | null {
  if (achievements.status === "ready" && achievements.data) return achievements.data;
  return game.achievements && game.achievements.total > 0 ? game.achievements : null;
}

export type AchievementFilter = "all" | "unlocked" | "locked";
export type AchievementSort = "unlockDate" | "rarity";

type Item = AchievementList["items"][number];

/**
 * The Achievements tab's list. "Unlock date": newest unlocks first, then locked ones in the
 * game's order. "Rarity": rarest first (unknown rarity last).
 */
export function filterAndSort(
  items: readonly Item[],
  filter: AchievementFilter,
  sort: AchievementSort,
): Item[] {
  const kept = items.filter(
    (item) => filter === "all" || (filter === "unlocked" ? item.unlocked : !item.unlocked),
  );
  if (sort === "rarity") {
    return [...kept].sort((a, b) => (a.globalPercent ?? Infinity) - (b.globalPercent ?? Infinity));
  }
  const time = (item: Item) => (item.unlockedAt ? Date.parse(item.unlockedAt) : -Infinity);
  return [...kept].sort((a, b) => time(b) - time(a));
}
