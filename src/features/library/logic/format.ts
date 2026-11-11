import { parseIsoDate } from "./dates";

const hoursFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const wholeFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const dayMonth = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dayMonthYear = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "45 min", "46.8 h", "1,204 h". */
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${(hours < 100 ? hoursFormat : wholeFormat).format(hours)} h`;
}

/** "Jan 6", or "Jan 6, 2024" when not in the current year. `null` if the date is unknown. */
export function formatShortDate(iso: string | null, today: Date = new Date()): string | null {
  const time = parseIsoDate(iso);
  if (time === null) return null;
  const date = new Date(time);
  return (date.getFullYear() === today.getFullYear() ? dayMonth : dayMonthYear).format(date);
}
