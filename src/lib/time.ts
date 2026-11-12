const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

/** "just now", "5 minutes ago", "yesterday"… for an ISO 8601 time in the past. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
