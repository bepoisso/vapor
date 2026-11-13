import type { Rule } from "@/lib/bindings";
import { EMPTY_SELECTION, selectionToRule } from "./facets";
import { draftToRule, hasConditions, ruleToDraft } from "./ruleDraft";

describe("ruleToDraft / draftToRule", () => {
  it("round-trips a default shelf rule", () => {
    const rule: Rule = {
      all: [
        { field: "tags", op: "includes", value: "Indie" },
        { field: "tags", op: "includes", value: "Hard" },
      ],
    };
    const draft = ruleToDraft(rule);
    expect(draft).toEqual({
      match: "all",
      rows: [
        { field: "tags", op: "includes", values: ["Indie"] },
        { field: "tags", op: "includes", values: ["Hard"] },
      ],
    });
    expect(draft && draftToRule(draft)).toEqual(rule);
  });

  it("reads the rules made by Save as shelf (one OR row per facet)", () => {
    const rule = selectionToRule({
      ...EMPTY_SELECTION,
      genre: ["Platformer", "RPG"],
      modes: ["Coop"],
    });
    const draft = ruleToDraft(rule);
    expect(draft).toEqual({
      match: "all",
      rows: [
        { field: "genre", op: "includes", values: ["Platformer", "RPG"] },
        { field: "modes", op: "includes", values: ["Coop"] },
      ],
    });
    expect(draft && draftToRule(draft)).toEqual(rule);
  });

  it("supports any-of rules and numeric conditions", () => {
    const rule: Rule = {
      any: [
        { field: "playtimeMinutes", op: "gt", value: 600 },
        { field: "lastPlayed", op: "olderThanDays", value: 90 },
      ],
    };
    expect(ruleToDraft(rule)?.match).toBe("any");
    const draft = ruleToDraft(rule);
    expect(draft && draftToRule(draft)).toEqual(rule);
  });

  it("refuses shapes it can't show", () => {
    expect(
      ruleToDraft({
        all: [{ field: "tags", op: "includes", value: "Indie" }],
        any: [{ field: "modes", op: "includes", value: "PvP" }],
      }),
    ).toBeNull();
    expect(
      ruleToDraft({
        all: [
          {
            any: [
              { field: "tags", op: "includes", value: "Indie" },
              { field: "modes", op: "includes", value: "PvP" },
            ],
          },
        ],
      }),
    ).toBeNull();
  });

  it("drops rows without values", () => {
    const draft = {
      match: "all" as const,
      rows: [{ field: "genre" as const, op: "includes" as const, values: [] }],
    };
    expect(hasConditions(draft)).toBe(false);
    expect(draftToRule(draft)).toEqual({ all: [] });
  });
});
