const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses an ISO 8601 date or date-time to epoch ms. Date-only values ("2026-01-06") are read as
 * local midnight, not UTC, so they never shift to the previous day west of Greenwich.
 */
export function parseIsoDate(value: string | null): number | null {
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export const DAY_MS = 86_400_000;

/** Local calendar day as `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
