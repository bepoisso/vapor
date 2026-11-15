import { t } from "@/i18n";
import type { Condition, Rule } from "@/lib/bindings";
import {
  activeConditions,
  almostMatches,
  matchesRule,
  newCondition,
  ruleLabel,
  ruleSentence,
  whyMatched,
} from "./rules";
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

const cuphead = makeGame({
  appId: 268910,
  name: "Cuphead",
  genre: "Platformer",
  modes: ["Solo", "Coop"],
  tags: ["Indie"],
});

const tags = (...values: string[]): Condition => ({ field: "tags", values });
const modes = (...values: string[]): Condition => ({ field: "modes", values });
const all = (...conditions: Condition[]): Rule => ({ match: "all", conditions });
const any = (...conditions: Condition[]): Rule => ({ match: "any", conditions });

describe("matchesRule", () => {
  it("matches every game without active conditions; empty conditions are ignored", () => {
    expect(matchesRule(celeste, all(), NOW)).toBe(true);
    expect(matchesRule(celeste, all(tags(), modes("Coop")), NOW)).toBe(false);
    expect(matchesRule(stardew, all(tags(), modes("Coop")), NOW)).toBe(true);
    expect(activeConditions(all(tags(), modes()))).toEqual([]);
  });

  it("is OR inside a condition", () => {
    const rule = all(modes("Coop", "PvP"));
    expect(matchesRule(stardew, rule, NOW)).toBe(true);
    expect(matchesRule(celeste, rule, NOW)).toBe(false);
  });

  it("requires every condition with `all` (AND)", () => {
    const rule = all(tags("Indie"), tags("Hard"));
    expect(matchesRule(celeste, rule, NOW)).toBe(true);
    expect(matchesRule(stardew, rule, NOW)).toBe(false);
  });

  it("requires one condition with `any` (OR)", () => {
    const rule = any(tags("Hard"), modes("Coop"));
    expect(matchesRule(celeste, rule, NOW)).toBe(true);
    expect(matchesRule(stardew, rule, NOW)).toBe(true);
    expect(matchesRule(makeGame({ appId: 1, name: "X" }), rule, NOW)).toBe(false);
  });

  it("matches genres: (Platformer or Simulation) and Coop", () => {
    const rule = all({ field: "genre", values: ["Platformer", "Simulation"] }, modes("Coop"));
    expect(matchesRule(stardew, rule, NOW)).toBe(true);
    expect(matchesRule(celeste, rule, NOW)).toBe(false);
  });

  it("compares playtime in hours and achievements in %; unknown never matches", () => {
    const long = all({ field: "playtime", op: "gt", value: 10 });
    expect(matchesRule(celeste, long, NOW)).toBe(true);
    expect(matchesRule(stardew, long, NOW)).toBe(false);
    expect(matchesRule(celeste, all({ field: "playtime", op: "lt", value: 10 }), NOW)).toBe(false);

    const halfDone = all({ field: "achievementsPct", op: "gt", value: 50 });
    expect(matchesRule(celeste, halfDone, NOW)).toBe(true);
    expect(matchesRule(stardew, halfDone, NOW)).toBe(false);
  });

  it("tests the install state, never an unknown one", () => {
    const installed = all({ field: "installed", op: "is", value: true });
    expect(matchesRule(celeste, installed, NOW)).toBe(true);
    expect(matchesRule(stardew, installed, NOW)).toBe(false);
    const notInstalled = all({ field: "installed", op: "is", value: false });
    expect(matchesRule(stardew, notInstalled, NOW)).toBe(false);
  });

  it("olderThanDays: old and never-played games match, recent ones don't", () => {
    const backlog = all({ field: "lastPlayed", op: "olderThanDays", value: 90 });
    expect(matchesRule(celeste, backlog, NOW)).toBe(true);
    expect(matchesRule(stardew, backlog, NOW)).toBe(true);
    const recent = makeGame({ appId: 1, name: "Recent", lastPlayed: "2026-11-01" });
    expect(matchesRule(recent, backlog, NOW)).toBe(false);
  });

  it("starts new conditions inactive (sets) or with a comparison", () => {
    expect(newCondition("tags")).toEqual({ field: "tags", values: [] });
    expect(activeConditions(all(newCondition("playtime")))).toHaveLength(1);
  });
});

describe("almostMatches", () => {
  it("lists games missing exactly one condition of an `all` rule", () => {
    const rule = all(tags("Indie"), tags("Hard"));
    const almost = almostMatches([celeste, stardew, cuphead], rule, NOW);
    expect(almost.map((entry) => entry.game.name)).toEqual(["Stardew Valley", "Cuphead"]);
    expect(almost[0]?.missing).toEqual(tags("Hard"));
  });

  it("needs an `all` rule with at least two active conditions", () => {
    expect(almostMatches([stardew], all(tags("Hard")), NOW)).toEqual([]);
    expect(almostMatches([stardew], all(tags("Hard"), tags()), NOW)).toEqual([]);
    expect(almostMatches([stardew], any(tags("Hard"), modes("PvP")), NOW)).toEqual([]);
  });
});

describe("labels", () => {
  it("joins values with or, conditions with + (all) or | (any)", () => {
    expect(ruleLabel(all(tags("Indie"), tags("Hard")), t)).toBe("Indie + Hard");
    expect(ruleLabel(any(modes("Coop", "PvP"), tags("Chill")), t)).toBe("Coop or PvP | Chill");
    expect(ruleLabel(all(), t)).toBe("Everything");
    expect(
      ruleLabel(
        all(
          { field: "playtime", op: "gt", value: 10 },
          { field: "installed", op: "is", value: false },
          { field: "lastPlayed", op: "olderThanDays", value: 1 },
        ),
        t,
      ),
    ).toBe("Playtime > 10 h + Not installed + Not played for 1 day");
  });

  it("reads the rule as a sentence", () => {
    expect(ruleSentence(all(modes("Coop", "PvP"), tags("Indie")), t)).toBe(
      "Games whose mode is Coop or PvP, and whose vibe is Indie.",
    );
    expect(ruleSentence(any(tags("Story"), { field: "installed", op: "is", value: true }), t)).toBe(
      "Games whose vibe is Story, or that are installed.",
    );
    expect(ruleSentence(all(), t)).toBe("No condition: your whole library.");
  });

  it("says which selected values a game matched", () => {
    expect(whyMatched(stardew, all(modes("Coop", "PvP"), tags("Indie", "Hard")))).toBe(
      "Coop · Indie",
    );
  });
});
