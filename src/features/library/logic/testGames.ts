import type { Condition, Game, Shelf } from "@/lib/bindings";

/** Builds a game for tests; every unknown value is `null`, like the real backend. */
export function makeGame(overrides: Partial<Game> & Pick<Game, "appId" | "name">): Game {
  return {
    genre: null,
    modes: [],
    tags: [],
    installed: null,
    playtimeMinutes: null,
    lastPlayed: null,
    achievements: null,
    cloud: null,
    updatePending: null,
    images: { cover: null, coverSmall: null, hero: null, heroSmall: null, logo: null },
    ...overrides,
  };
}

/** A smart shelf for tests (all conditions); pass `kind`/`appIds` for the other kinds. */
export function makeShelf(
  overrides: Partial<Shelf> & Pick<Shelf, "id" | "name">,
  conditions: Condition[] = [],
): Shelf {
  return {
    kind: "smart",
    rule: { match: "all", conditions },
    visible: true,
    pinned: false,
    order: 0,
    showAsMood: false,
    hideNotInstalled: false,
    seeded: true,
    ...overrides,
  };
}
