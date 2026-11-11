import type { Condition, Field, Game, Rule, RuleNode } from "@/lib/bindings";
import { DAY_MS, parseIsoDate } from "./dates";

/**
 * The one rule engine behind smart shelves, moods and "Save as shelf".
 * `all` = AND, `any` = OR, groups nest. An empty rule matches every game.
 */

export function isCondition(node: RuleNode): node is Condition {
  return "field" in node;
}

type FieldValue = readonly string[] | number | boolean | null;

function fieldValue(game: Game, field: Field): FieldValue {
  switch (field) {
    case "genre":
      return game.genre ? [game.genre] : [];
    case "modes":
      return game.modes;
    case "tags":
      return game.tags;
    case "installed":
      return game.installed;
    case "playtimeMinutes":
      return game.playtimeMinutes;
    case "lastPlayed":
      return parseIsoDate(game.lastPlayed);
    case "achievementsPct": {
      const achievements = game.achievements;
      if (!achievements || achievements.total === 0) return null;
      return (achievements.unlocked / achievements.total) * 100;
    }
  }
}

export function matchesCondition(game: Game, condition: Condition, now: number): boolean {
  const actual = fieldValue(game, condition.field);
  const { op, value } = condition;

  if (Array.isArray(actual)) {
    // List fields (genre, modes, tags): `includes` and `eq` both test membership.
    return (op === "includes" || op === "eq") && actual.includes(String(value));
  }

  switch (op) {
    case "includes":
      return false;
    case "eq":
      return actual !== null && actual === value;
    case "lt":
      return typeof actual === "number" && typeof value === "number" && actual < value;
    case "gt":
      return typeof actual === "number" && typeof value === "number" && actual > value;
    case "olderThanDays":
      if (condition.field !== "lastPlayed" || typeof value !== "number") return false;
      // Never played counts as "not played for N days".
      return typeof actual !== "number" || now - actual > value * DAY_MS;
  }
}

function matchesNode(game: Game, node: RuleNode, now: number): boolean {
  return isCondition(node) ? matchesCondition(game, node, now) : matchesRule(game, node, now);
}

export function matchesRule(game: Game, rule: Rule, now: number = Date.now()): boolean {
  const { all = [], any = [] } = rule;
  return (
    all.every((node) => matchesNode(game, node, now)) &&
    (any.length === 0 || any.some((node) => matchesNode(game, node, now)))
  );
}
