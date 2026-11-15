import type { Translate } from "@/i18n";
import type { Condition, Field, Game, Rule } from "@/lib/bindings";
import { DAY_MS, parseIsoDate } from "./dates";

/**
 * The one rule engine behind smart shelves, moods, "Save as shelf" and the game page's "Appears
 * in" (`docs/SMART_SHELVES_SPEC.md` §0). A rule is a list of conditions combined with AND
 * (`match: "all"`) or OR (`"any"`). A set condition (genre, modes, tags) passes when the game
 * has ANY of its values; the others compare a number, a date or yes/no. Conditions with nothing
 * set are ignored; a rule without active conditions matches every game.
 */

export const SET_FIELDS: readonly Field[] = ["genre", "modes", "tags"];
export const VALUE_FIELDS: readonly Field[] = [
  "playtime",
  "lastPlayed",
  "installed",
  "achievementsPct",
];
export const FIELDS: readonly Field[] = [...SET_FIELDS, ...VALUE_FIELDS];

export function isSetField(field: Field): boolean {
  return SET_FIELDS.includes(field);
}

/** A condition that tests something (values picked, or a comparison set). */
export function isActive(condition: Condition): boolean {
  if (isSetField(condition.field)) return (condition.values ?? []).length > 0;
  return condition.op != null && condition.value != null;
}

export function activeConditions(rule: Rule): Condition[] {
  return (rule.conditions ?? []).filter(isActive);
}

/** A new condition for a field, with a sensible starting comparison. */
export function newCondition(field: Field): Condition {
  switch (field) {
    case "genre":
    case "modes":
    case "tags":
      return { field, values: [] };
    case "playtime":
      return { field, op: "gt", value: 10 };
    case "lastPlayed":
      return { field, op: "olderThanDays", value: 90 };
    case "installed":
      return { field, op: "is", value: true };
    case "achievementsPct":
      return { field, op: "lt", value: 50 };
  }
}

export function setValues(game: Game, field: Field): readonly string[] {
  switch (field) {
    case "genre":
      return game.genre ? [game.genre] : [];
    case "modes":
      return game.modes;
    case "tags":
      return game.tags;
    default:
      return [];
  }
}

function compare(actual: number | null, op: Condition["op"], value: number): boolean {
  if (actual === null) return false;
  if (op === "gt") return actual > value;
  if (op === "lt") return actual < value;
  return false;
}

export function matchesCondition(game: Game, condition: Condition, now: number): boolean {
  const { field, op, value } = condition;
  if (isSetField(field)) {
    const have = setValues(game, field);
    return (condition.values ?? []).some((wanted) => have.includes(wanted));
  }
  switch (field) {
    case "installed":
      // Unknown install state never matches either way.
      return game.installed !== null && game.installed === value;
    case "playtime":
      return (
        typeof value === "number" &&
        compare(game.playtimeMinutes === null ? null : game.playtimeMinutes / 60, op, value)
      );
    case "lastPlayed": {
      if (op !== "olderThanDays" || typeof value !== "number") return false;
      const last = parseIsoDate(game.lastPlayed);
      // Never played counts as "not played for N days".
      return last === null || now - last > value * DAY_MS;
    }
    case "achievementsPct": {
      const achievements = game.achievements;
      if (!achievements || achievements.total === 0 || typeof value !== "number") return false;
      return compare((achievements.unlocked / achievements.total) * 100, op, value);
    }
    default:
      return false;
  }
}

export function matchesRule(game: Game, rule: Rule, now: number = Date.now()): boolean {
  const active = activeConditions(rule);
  if (active.length === 0) return true;
  const passes = (condition: Condition) => matchesCondition(game, condition, now);
  return rule.match === "all" ? active.every(passes) : active.some(passes);
}

export interface AlmostMatch {
  game: Game;
  /** The one condition the game misses. */
  missing: Condition;
}

/**
 * "Almost in": games failing exactly one active condition of an `all` rule with at least two
 * active conditions.
 */
export function almostMatches(
  games: readonly Game[],
  rule: Rule,
  now: number = Date.now(),
): AlmostMatch[] {
  const active = activeConditions(rule);
  if (rule.match !== "all" || active.length < 2) return [];
  const result: AlmostMatch[] = [];
  for (const game of games) {
    const missed = active.filter((condition) => !matchesCondition(game, condition, now));
    if (missed.length === 1 && missed[0]) result.push({ game, missing: missed[0] });
  }
  return result;
}

/** Which selected values a matching game has, per set condition: "Coop · Indie". */
export function whyMatched(game: Game, rule: Rule): string {
  return activeConditions(rule)
    .filter((condition) => isSetField(condition.field))
    .map((condition) => {
      const have = setValues(game, condition.field);
      return (condition.values ?? []).filter((value) => have.includes(value)).join("/");
    })
    .filter(Boolean)
    .join(" · ");
}

/** The value part of a condition: "Indie or Hard", "> 10 h", "Not played for 90 days". */
export function conditionText(condition: Condition, t: Translate): string {
  const { field, op, value } = condition;
  if (isSetField(field)) return (condition.values ?? []).join(` ${t("rules.or")} `);
  const number = typeof value === "number" ? value : 0;
  const symbol = op === "lt" ? "<" : ">";
  switch (field) {
    case "installed":
      return value === false ? t("rules.notInstalled") : t("rules.installed");
    case "playtime":
      return t("rules.playtime", { symbol, value: number });
    case "lastPlayed":
      return t("rules.notPlayedFor", { count: number });
    case "achievementsPct":
      return t("rules.achievements", { symbol, value: number });
    default:
      return "";
  }
}

/** Short badge text: "Indie + Hard", "Coop or PvP | Chill". */
export function ruleLabel(rule: Rule, t: Translate): string {
  const active = activeConditions(rule);
  if (active.length === 0) return t("rules.everything");
  return active
    .map((condition) => conditionText(condition, t))
    .join(rule.match === "all" ? ` ${t("rules.and")} ` : ` ${t("rules.anyJoiner")} `);
}

function clause(condition: Condition, t: Translate): string {
  const { field, op, value } = condition;
  if (isSetField(field)) {
    return t("rules.sentence.set", {
      field: t(`rules.fields.${field}`).toLowerCase(),
      values: conditionText(condition, t),
    });
  }
  const number = typeof value === "number" ? value : 0;
  switch (field) {
    case "installed":
      return value === false ? t("rules.sentence.notInstalled") : t("rules.sentence.installed");
    case "playtime":
      return t(op === "lt" ? "rules.sentence.playtimeLt" : "rules.sentence.playtimeGt", {
        value: number,
      });
    case "lastPlayed":
      return t("rules.sentence.notPlayedFor", { count: number });
    case "achievementsPct":
      return t(op === "lt" ? "rules.sentence.achievementsLt" : "rules.sentence.achievementsGt", {
        value: number,
      });
    default:
      return "";
  }
}

/** "Games whose mode is Coop or PvP, and whose vibe is Indie." */
export function ruleSentence(rule: Rule, t: Translate): string {
  const active = activeConditions(rule);
  if (active.length === 0) return t("rules.sentence.everything");
  const clauses = active
    .map((condition) => clause(condition, t))
    .join(rule.match === "all" ? t("rules.sentence.and") : t("rules.sentence.or"));
  return t("rules.sentence.games", { clauses });
}
