import { addDays, dayKey, startOfDay, WEEK_STARTS_ON } from "./calendar";

// Grouping things per day, week or month, for the charts on the Dashboard and the
// Time page (their Day / Week / Month switch).

export type Period = "day" | "week" | "month";

/** How many columns each period shows, and how that span is described. */
export const PERIODS: Record<Period, { label: string; columns: number; span: string }> = {
  day: { label: "Day", columns: 14, span: "14 days" },
  week: { label: "Week", columns: 12, span: "12 weeks" },
  month: { label: "Month", columns: 12, span: "12 months" },
};

/** The first day of the day / week / month that `date` falls in (weeks start on WEEK_STARTS_ON). */
export function periodStart(date: Date, period: Period): Date {
  const day = startOfDay(date);
  if (period === "day") return day;
  if (period === "week") return addDays(day, -((day.getDay() - WEEK_STARTS_ON + 7) % 7));
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

/** The start of the period `count` periods before `start`. */
function periodsBefore(start: Date, period: Period, count: number): Date {
  if (period === "day") return addDays(start, -count);
  if (period === "week") return addDays(start, -7 * count);
  return new Date(start.getFullYear(), start.getMonth() - count, 1);
}

/**
 * Adds up `items` per day / week / month over the last few periods (see PERIODS),
 * oldest first. The last column is the current day / week / month.
 * Each item has a moment (`at`, in milliseconds) and an amount (`value`).
 */
export function sumPer(items: { at: number; value: number }[], now: number, period: Period) {
  const sums = new Map<string, number>();
  for (const { at, value } of items) {
    const key = dayKey(periodStart(new Date(at), period));
    sums.set(key, (sums.get(key) ?? 0) + value);
  }
  const current = periodStart(new Date(now), period);
  const columns = PERIODS[period].columns;
  return Array.from({ length: columns }, (_, i) => {
    const start = periodsBefore(current, period, columns - 1 - i);
    return { start, value: sums.get(dayKey(start)) ?? 0 };
  });
}
