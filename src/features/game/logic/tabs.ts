export const GAME_TABS = [
  "overview",
  "achievements",
  "news",
  "guides",
  "discussions",
  "notes",
] as const;
export type GameTab = (typeof GAME_TABS)[number];

const KEY = "vapor.gameTabs";
/** Keep the last tab of this many games. */
const MAX_ENTRIES = 50;

type Entry = [appId: number, tab: GameTab];

function isTab(value: unknown): value is GameTab {
  return typeof value === "string" && (GAME_TABS as readonly string[]).includes(value);
}

/** Most recent last. A list, not an object: numeric object keys don't keep insertion order. */
function readAll(): Entry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Entry =>
        Array.isArray(entry) && typeof entry[0] === "number" && isTab(entry[1]),
    );
  } catch {
    return [];
  }
}

/** The tab last open on this game's page (a per-viewer convenience: may be lost). */
export function readTab(appId: number): GameTab {
  return readAll().find(([id]) => id === appId)?.[1] ?? "overview";
}

export function writeTab(appId: number, tab: GameTab): void {
  const entries = [...readAll().filter(([id]) => id !== appId), [appId, tab] satisfies Entry];
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage unavailable: the tab is simply not remembered.
  }
}
