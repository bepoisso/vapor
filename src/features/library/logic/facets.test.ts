import type { Game } from "@/lib/bindings";
import {
  buildFacets,
  EMPTY_SELECTION,
  facetCounts,
  type FacetSelection,
  passesFacets,
  selectionToRule,
} from "./facets";
import { matchesRule } from "./rules";
import { makeGame } from "./testGames";

const games: Game[] = [
  makeGame({
    appId: 1,
    name: "Celeste",
    genre: "Platformer",
    modes: ["Solo"],
    tags: ["Indie", "Hard"],
  }),
  makeGame({
    appId: 2,
    name: "Cuphead",
    genre: "Platformer",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Hard"],
  }),
  makeGame({
    appId: 3,
    name: "Stardew",
    genre: "Simulation",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Chill"],
  }),
  makeGame({ appId: 4, name: "CS2", genre: "FPS", modes: ["PvP"], tags: ["Competitive"] }),
  makeGame({ appId: 5, name: "Witcher 3", genre: "RPG", modes: ["Solo"], tags: ["Story"] }),
];

const select = (partial: Partial<FacetSelection>): FacetSelection => ({
  ...EMPTY_SELECTION,
  ...partial,
});

describe("buildFacets", () => {
  it("lists genres by count, modes in a fixed order and vibe tags in the reference order", () => {
    const [genre, modes, tags] = buildFacets(games);
    expect(genre?.values).toEqual(["Platformer", "FPS", "RPG", "Simulation"]);
    expect(modes?.values).toEqual(["Solo", "Coop", "PvP"]);
    expect(tags?.values).toEqual(["Indie", "Hard", "Story", "Chill", "Competitive"]);
  });
});

describe("passesFacets", () => {
  it("is OR within a facet", () => {
    const selection = select({ genre: ["Platformer", "RPG"] });
    expect(games.filter((g) => passesFacets(g, selection)).map((g) => g.name)).toEqual([
      "Celeste",
      "Cuphead",
      "Witcher 3",
    ]);
  });

  it("is AND across facets", () => {
    const selection = select({ genre: ["Platformer", "Simulation"], modes: ["Coop"] });
    expect(games.filter((g) => passesFacets(g, selection)).map((g) => g.name)).toEqual([
      "Cuphead",
      "Stardew",
    ]);
  });
});

describe("facetCounts", () => {
  it("counts each chip against the other facets' selections only", () => {
    const counts = facetCounts(games, select({ genre: ["Platformer"], modes: ["Coop"] }));
    // Genre counts ignore the genre selection but apply Mode = Coop.
    expect(counts.genre.get("Platformer")).toBe(1);
    expect(counts.genre.get("Simulation")).toBe(1);
    expect(counts.genre.get("FPS")).toBeUndefined();
    // Mode counts ignore the mode selection but apply Genre = Platformer.
    expect(counts.modes.get("Solo")).toBe(2);
    expect(counts.modes.get("Coop")).toBe(1);
    expect(counts.modes.get("PvP")).toBeUndefined();
    // Vibe counts apply both selections.
    expect(counts.tags.get("Hard")).toBe(1);
  });
});

describe("selectionToRule", () => {
  it("produces a rule that selects exactly the filtered games", () => {
    const selection = select({ genre: ["Platformer", "Simulation"], modes: ["Coop"] });
    const rule = selectionToRule(selection);
    expect(rule).toEqual({
      all: [
        {
          any: [
            { field: "genre", op: "includes", value: "Platformer" },
            { field: "genre", op: "includes", value: "Simulation" },
          ],
        },
        { field: "modes", op: "includes", value: "Coop" },
      ],
    });
    for (const game of games) {
      expect(matchesRule(game, rule)).toBe(passesFacets(game, selection));
    }
  });
});
