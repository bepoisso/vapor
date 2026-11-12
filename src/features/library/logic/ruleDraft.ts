import type { Condition, Field, Op, Rule, RuleNode } from "@/lib/bindings";
import { isCondition } from "./rules";

/**
 * What the shelf editor edits: rows combined with AND ("all") or OR ("any"). A row is one
 * field + operator with one or more values, which are OR'ed: "Genre is Platformer or RPG".
 * This covers the default shelves and the rules "Save as shelf" produces.
 */

export type DraftValue = string | number | boolean;

export interface DraftRow {
  field: Field;
  op: Op;
  values: DraftValue[];
}

export interface RuleDraft {
  match: "all" | "any";
  rows: DraftRow[];
}

/** Fields whose values are picked from the library (several at once). */
export const LIST_FIELDS: readonly Field[] = ["genre", "modes", "tags"];

export const DRAFT_FIELDS: readonly Field[] = [
  "genre",
  "modes",
  "tags",
  "installed",
  "playtimeMinutes",
  "lastPlayed",
  "achievementsPct",
];

export function defaultRow(field: Field): DraftRow {
  switch (field) {
    case "genre":
    case "modes":
    case "tags":
      return { field, op: "includes", values: [] };
    case "installed":
      return { field, op: "eq", values: [true] };
    case "playtimeMinutes":
      return { field, op: "gt", values: [10 * 60] };
    case "lastPlayed":
      return { field, op: "olderThanDays", values: [90] };
    case "achievementsPct":
      return { field, op: "lt", values: [50] };
  }
}

/** `null` when the rule has a shape the editor can't show (it can then only be renamed). */
export function ruleToDraft(rule: Rule): RuleDraft | null {
  const all = rule.all ?? [];
  const any = rule.any ?? [];
  if (all.length > 0 && any.length > 0) return null;
  const rows: DraftRow[] = [];
  for (const node of all.length > 0 ? all : any) {
    const row = nodeToRow(node);
    if (!row) return null;
    rows.push(row);
  }
  return { match: any.length > 0 ? "any" : "all", rows };
}

function nodeToRow(node: RuleNode): DraftRow | null {
  if (isCondition(node)) {
    return node.value === null ? null : { field: node.field, op: node.op, values: [node.value] };
  }
  // A group: only "any of the same field + operator" maps to one row.
  if ((node.all?.length ?? 0) > 0) return null;
  const conditions = node.any ?? [];
  const first = conditions[0];
  if (!first || !isCondition(first)) return null;
  const values: DraftValue[] = [];
  for (const condition of conditions) {
    if (!isCondition(condition) || condition.field !== first.field || condition.op !== first.op) {
      return null;
    }
    if (condition.value === null) return null;
    values.push(condition.value);
  }
  return { field: first.field, op: first.op, values };
}

/** Rows without values are left out. */
export function draftToRule(draft: RuleDraft): Rule {
  const condition = (row: DraftRow, value: DraftValue): Condition => ({
    field: row.field,
    op: row.op,
    value,
  });
  const nodes: RuleNode[] = draft.rows
    .filter((row) => row.values.length > 0)
    .map((row) =>
      row.values.length === 1 && row.values[0] !== undefined
        ? condition(row, row.values[0])
        : { any: row.values.map((value) => condition(row, value)) },
    );
  return draft.match === "all" ? { all: nodes } : { any: nodes };
}

export function hasConditions(draft: RuleDraft): boolean {
  return draft.rows.some((row) => row.values.length > 0);
}
