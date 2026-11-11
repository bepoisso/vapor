import type { Game, Rule } from "@/lib/bindings";
import { DAY_MS, localDayKey, parseIsoDate } from "./dates";
import { matchesRule } from "./rules";

/** A game played within this window counts as "played recently". */
const RECENT_DAYS = 14;

/** FNV-1a: a small, stable string hash for the per-day shuffle. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Mood suggestions: installed games first, then games not played recently, then a shuffle that
 * is stable for the whole day (no reshuffle on every render).
 */
export function pickSuggestions(
  games: readonly Game[],
  rule: Rule,
  today: Date,
  count: number,
): Game[] {
  const now = today.getTime();
  const day = localDayKey(today);
  const keyed = games
    .filter((game) => matchesRule(game, rule, now))
    .map((game) => {
      const lastPlayed = parseIsoDate(game.lastPlayed);
      return {
        game,
        notInstalled: game.installed === true ? 0 : 1,
        playedRecently: lastPlayed !== null && now - lastPlayed < RECENT_DAYS * DAY_MS ? 1 : 0,
        shuffle: hash(`${day}:${game.appId}`),
      };
    });
  keyed.sort(
    (a, b) =>
      a.notInstalled - b.notInstalled ||
      a.playedRecently - b.playedRecently ||
      a.shuffle - b.shuffle,
  );
  return keyed.slice(0, count).map(({ game }) => game);
}
