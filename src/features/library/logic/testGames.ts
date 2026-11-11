import type { Game } from "@/lib/bindings";

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
    images: { cover: null, hero: null, heroSmall: null, logo: null },
    ...overrides,
  };
}
