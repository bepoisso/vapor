import type { Rule } from "@/lib/bindings";
import { pickSuggestions } from "./suggestions";
import { makeGame } from "./testGames";

const story: Rule = { any: [{ field: "tags", op: "includes", value: "Story" }] };
const today = new Date(2026, 10, 11);

const games = [
  makeGame({
    appId: 1,
    name: "Recent installed",
    tags: ["Story"],
    installed: true,
    lastPlayed: "2026-11-10",
  }),
  makeGame({
    appId: 2,
    name: "Old installed",
    tags: ["Story"],
    installed: true,
    lastPlayed: "2025-01-01",
  }),
  makeGame({ appId: 3, name: "Not installed", tags: ["Story"], installed: false }),
  makeGame({ appId: 4, name: "Unknown install", tags: ["Story"] }),
  makeGame({ appId: 5, name: "Not a story", tags: ["Chill"], installed: true }),
];

describe("pickSuggestions", () => {
  it("keeps matching games only, installed first, recently played last among them", () => {
    const names = pickSuggestions(games, story, today, 4).map((game) => game.name);
    expect(names).toHaveLength(4);
    expect(names).not.toContain("Not a story");
    expect(names.slice(0, 2)).toEqual(["Old installed", "Recent installed"]);
  });

  it("is stable within a day", () => {
    const first = pickSuggestions(games, story, today, 4);
    const later = pickSuggestions(games, story, new Date(2026, 10, 11, 23, 59), 4);
    expect(later).toEqual(first);
  });

  it("returns at most `count` games", () => {
    expect(pickSuggestions(games, story, today, 2)).toHaveLength(2);
  });
});
