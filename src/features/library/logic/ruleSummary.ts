import type { Translate } from "@/i18n";
import type { Condition, Rule, RuleNode } from "@/lib/bindings";
import { isCondition } from "./rules";

/** Human-readable rule, e.g. "Indie + Hard" or "Coop or PvP" (rule badge next to a shelf title). */
export function ruleSummary(rule: Rule, t: Translate): string {
  const all = (rule.all ?? []).map((node) => nodeSummary(node, t, true));
  const any = (rule.any ?? []).map((node) => nodeSummary(node, t, true));
  const anyText = any.join(` ${t("rules.or")} `);
  if (all.length === 0) return anyText;
  const allText = all.join(` ${t("rules.and")} `);
  if (any.length === 0) return allText;
  return `${allText} ${t("rules.and")} ${any.length > 1 ? `(${anyText})` : anyText}`;
}

function nodeSummary(node: RuleNode, t: Translate, nested: boolean): string {
  if (isCondition(node)) return conditionSummary(node, t);
  const text = ruleSummary(node, t);
  const size = (node.all?.length ?? 0) + (node.any?.length ?? 0);
  return nested && size > 1 ? `(${text})` : text;
}

function conditionSummary({ field, op, value }: Condition, t: Translate): string {
  if (field === "genre" || field === "modes" || field === "tags") return String(value);
  if (field === "installed") return value === true ? t("rules.installed") : t("rules.notInstalled");
  if (field === "lastPlayed" && op === "olderThanDays") {
    return t("rules.notPlayedFor", { count: Number(value) });
  }
  const symbol = op === "lt" ? "<" : op === "gt" ? ">" : "=";
  if (field === "playtimeMinutes") return t("rules.playtime", { symbol, value: String(value) });
  if (field === "achievementsPct") return t("rules.achievements", { symbol, value: String(value) });
  return `${field} ${symbol} ${String(value)}`;
}
