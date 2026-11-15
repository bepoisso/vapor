import { DAY_MS, localDayKey, parseIsoDate } from "@/features/library/logic/dates";
import { formatShortDate } from "@/features/library/logic/format";

const oneDecimal = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const sizeFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const fullDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

/** Hours with one decimal: "46.8 h", "1,204.5 h". */
export function formatHours(minutes: number): string {
  return `${oneDecimal.format(minutes / 60)} h`;
}

const SIZE_UNITS = ["KB", "MB", "GB", "TB"] as const;

/** "850 MB", "1.2 GB" (binary units, as Steam shows them). */
export function formatSize(bytes: number): string {
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit >= 2 ? sizeFormat.format(value) : String(Math.round(value));
  return `${rounded} ${SIZE_UNITS[unit]}`;
}

export type LastSession =
  { kind: "today" } | { kind: "yesterday" } | { kind: "date"; label: string } | { kind: "never" };

/** "Today", "Yesterday", "Jan 6" or "Never" (no known session). */
export function lastSession(iso: string | null, now: Date = new Date()): LastSession {
  const time = parseIsoDate(iso);
  if (time === null) return { kind: "never" };
  const day = localDayKey(new Date(time));
  if (day === localDayKey(now)) return { kind: "today" };
  if (day === localDayKey(new Date(now.getTime() - DAY_MS))) return { kind: "yesterday" };
  return { kind: "date", label: formatShortDate(iso, now) ?? "" };
}

/** Whole percent of unlocked achievements. */
export function percent(unlocked: number, total: number): number {
  return total > 0 ? Math.round((unlocked / total) * 100) : 0;
}

/** "12.3", "0.4", "70" (one decimal at most). */
export function formatPercent(value: number): string {
  return sizeFormat.format(value);
}

/** "Nov 27, 2024" (news keeps the year, unlike play dates). Empty if the date is unknown. */
export function formatFullDate(iso: string | null): string {
  const time = parseIsoDate(iso);
  return time === null ? "" : fullDate.format(new Date(time));
}
