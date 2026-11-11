import type { Condition, Rule } from "@/lib/bindings";
import { matchesRule } from "./rules";
import { makeGame } from "./testGames";

const NOW = new Date(2026, 10, 11).getTime();

const celeste = makeGame({
  appId: 504230,
  name: "Celeste",
  genre: "Platformer",
  modes: ["Solo"],
  tags: ["Indie", "Hard"],
  installed: true,
  playtimeMinutes: 2808,
  lastPlayed: "2026-01-06",
  achievements: { unlocked: 18, total: 32 },
});

const stardew = makeGame({
  appId: 413150,
  name: "Stardew Valley",
  genre: "Simulation",
  modes: ["Solo", "Coop"],
  tags: ["Indie", "Chill"],
});

const tag = (value: string): Condition => ({ field: "tags", op: "includes", value });
const mode = (value: string): Condition => ({ field: "modes", op: "includes", value });

describe("matchesRule", () => {
  it("matches every game with an empty rule", () => {
    expect(matchesRule(celeste, {}, NOW)).toBe(true);
  });

  it("requires every condition of `all` (AND)", () => {
    const rule: Rule = { all: [tag("Indie"), tag("Hard")] };
    expect(matchesRule(celeste, rule, NOW)).toBe(true);
    expect(matchesRule(stardew, rule, NOW)).toBe(false);
  });

  it("requires at least one condition of `any` (OR)", () => {
    const rule: Rule = { any: [mode("Coop"), mode("PvP")] };
    expect(matchesRule(stardew, rule, NOW)).toBe(true);
    expect(matchesRule(celeste, rule, NOW)).toBe(false);
  });

  it("combines `all` and `any`", () => {
    const rule: Rule = { all: [tag("Indie")], any: [tag("Hard"), mode("PvP")] };
    expect(matchesRule(celeste, rule, NOW)).toBe(true);
    expect(matchesRule(stardew, rule, NOW)).toBe(false);
  });

  it("evaluates nested groups: (Platformer OR Simulation) AND Coop", () => {
    const rule: Rule = {
      all: [
        {
          any: [
            { field: "genre", op: "includes", value: "Platformer" },
            { field: "genre", op: "includes", value: "Simulation" },
          ],
        },
        mode("Coop"),
      ],
    };
    expect(matchesRule(stardew, rule, NOW)).toBe(true);
    expect(matchesRule(celeste, rule, NOW)).toBe(false);
  });

  it("compares numbers and treats unknown values as non-matching", () => {
    const longGames: Rule = { all: [{ field: "playtimeMinutes", op: "gt", value: 600 }] };
    expect(matchesRule(celeste, longGames, NOW)).toBe(true);
    expect(matchesRule(stardew, longGames, NOW)).toBe(false);

    const halfDone: Rule = { all: [{ field: "achievementsPct", op: "gt", value: 50 }] };
    expect(matchesRule(celeste, halfDone, NOW)).toBe(true);
  });

  it("matches booleans with eq, never null", () => {
    const installed: Rule = { all: [{ field: "installed", op: "eq", value: true }] };
    expect(matchesRule(celeste, installed, NOW)).toBe(true);
    expect(matchesRule(stardew, installed, NOW)).toBe(false);
  });

  it("olderThanDays: old and never-played games match, recent ones don't", () => {
    const backlog: Rule = { all: [{ field: "lastPlayed", op: "olderThanDays", value: 90 }] };
    expect(matchesRule(celeste, backlog, NOW)).toBe(true);
    expect(matchesRule(stardew, backlog, NOW)).toBe(true);
    const recent = makeGame({ appId: 1, name: "Recent", lastPlayed: "2026-11-01" });
    expect(matchesRule(recent, backlog, NOW)).toBe(false);
  });
});
