import type { Game } from "@/lib/bindings";

const STORAGE_KEY = "vapor.syntheticGames";

/**
 * Stress test for the performance budgets (`pnpm perf:library`):
 * `sessionStorage.setItem("vapor.syntheticGames", "3000")` then reload to pad the library with
 * copies of its games. Session storage dies with the app, so an interrupted run can never leave
 * a padded library behind. Works in release builds too, so they can be measured.
 */
export function withSyntheticGames(games: readonly Game[]): readonly Game[] {
  if (games.length === 0) return games;
  let target = 0;
  try {
    target = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
  } catch {
    return games;
  }
  if (!Number.isFinite(target) || target <= games.length) return games;
  const padded = [...games];
  for (let i = games.length; i < target; i++) {
    const source = games[i % games.length];
    if (!source) break;
    padded.push({ ...source, appId: 1_000_000_000 + i, name: `${source.name} #${i}` });
  }
  return padded;
}
