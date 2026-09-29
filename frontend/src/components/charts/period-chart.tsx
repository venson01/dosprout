"use client";

import { useSearchParams } from "next/navigation";
import { PERIODS, type Period } from "@/lib/periods";

/**
 * The chosen Day / Week / Month, kept in the address (?per=week) like ?view= on the
 * Tasks page. `path` is the page's own address, used when going back to the default.
 * The page must be inside <Suspense> (Next.js rule for useSearchParams).
 */
export function usePeriodParam(path: string): [Period, (next: Period) => void] {
  const searchParams = useSearchParams();
  const per = searchParams.get("per");
  const period: Period = per === "week" || per === "month" ? per : "day";

  function choose(next: Period) {
    const params = new URLSearchParams(searchParams);
    if (next === "day") params.delete("per");
    else params.set("per", next);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : path);
  }
  return [period, choose];
}

/** The label under a column: "28" (day), "9/21" (week, its first day) or "Sep" (month). */
function columnLabel(start: Date, period: Period): string {
  if (period === "day") return String(start.getDate());
  if (period === "week") return `${start.getMonth() + 1}/${start.getDate()}`;
  return start.toLocaleDateString("en-US", { month: "short" });
}

/** The full name of a column, for the tooltip and the screen-reader table. */
function columnName(start: Date, period: Period): string {
  if (period === "day") {
    return start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (period === "week") {
    return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const CAPTIONS: Record<Period, string> = {
  day: "Day of the month.",
  week: "Weeks start on Monday; each column shows the week's first day.",
  month: "Month.",
};

interface PeriodChartProps {
  /** One column per day / week / month, oldest first (see sumPer in lib/periods.ts). */
  columns: { start: Date; value: number }[];
  period: Period;
  onPeriodChange: (period: Period) => void;
  /** How a value is written: on the axis, the busiest column and in the tooltip. */
  formatValue: (value: number) => string;
  /** What the numbers are, for the tooltip and the table, e.g. "done" or "tracked". */
  valueLabel: string;
  /** Describes the chart for screen readers, e.g. "Tasks completed". */
  description: string;
  /** The smallest top of the scale, so an empty or nearly empty chart still reads well. Default 1. */
  minScale?: number;
}

/**
 * A column chart with a Day / Week / Month switch above it (used by the Dashboard and
 * the Time page). One series, so no legend (the card's title names it). Columns are at
 * most 24px wide and rounded only at the top; only the busiest column gets its number
 * printed, the rest show on hover; screen readers get the same numbers as a table.
 */
export function PeriodChart({
  columns,
  period,
  onPeriodChange,
  formatValue,
  valueLabel,
  description,
  minScale = 1,
}: PeriodChartProps) {
  // The top of the scale: at least minScale, so an empty chart still has an axis.
  const max = Math.max(minScale, ...columns.map((column) => column.value));
  const busiest = columns.reduce((best, column) => (column.value > best.value ? column : best), columns[0]);
  const { span } = PERIODS[period];

  return (
    <>
      {/* The filter sits in one row above the chart. */}
      <div role="group" aria-label="Group by" className="mb-4 inline-flex rounded-lg bg-page p-1 ring-1 ring-line">
        {(Object.keys(PERIODS) as Period[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={period === option}
            onClick={() => onPeriodChange(option)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              period === option ? "bg-brand text-white shadow-sm" : "text-ink hover:bg-white"
            }`}
          >
            {PERIODS[option].label}
          </button>
        ))}
      </div>

      <div aria-hidden className="flex h-48 gap-2">
        {/* Y axis: just the top value and zero, so the columns can be read. */}
        <div className="flex flex-col justify-between text-right text-xs text-muted">
          <span>{formatValue(max)}</span>
          {/* Moved down half a line so it sits level with the baseline. */}
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex flex-1 items-end border-b border-line pb-0">
          {/* A faint line at the top value. */}
          <div className="pointer-events-none absolute inset-x-0 top-2 border-t border-dashed border-line" />
          {columns.map(({ start, value }, index) => {
            const isCurrent = index === columns.length - 1;
            // Keep the tooltip and the printed number inside the card near the edges.
            const nearStart = index < 2;
            const nearEnd = index > columns.length - 3;
            const tipPosition = nearStart ? "left-0" : nearEnd ? "right-0" : "left-1/2 -translate-x-1/2";
            const numberPosition = nearStart ? "left-0" : nearEnd ? "right-0" : "inset-x-0 text-center";
            // Week labels ("12/28") are too wide for every column on a phone, so show every
            // other one there, always including the current week.
            const hideOnPhone = period === "week" && (columns.length - 1 - index) % 2 === 1;
            return (
              <div key={start.getTime()} className="group relative flex h-full flex-1 flex-col justify-end">
                {/* The column: at most 24px wide, rounded only at the top. */}
                <div className="flex h-[calc(100%-0.5rem)] items-end justify-center">
                  <div
                    className={`w-full max-w-6 rounded-t-[4px] ${value > 0 ? "bg-brand" : ""} group-hover:opacity-80`}
                    style={{ height: `${(value / max) * 100}%` }}
                  />
                </div>
                {/* Only the busiest column gets its number printed; the rest are in the tooltip. */}
                {value > 0 && start === busiest.start && (
                  <span
                    className={`absolute whitespace-nowrap text-xs font-medium text-ink ${numberPosition}`}
                    style={{ bottom: `calc(${(value / max) * 100}% - 0.25rem)` }}
                  >
                    {formatValue(value)}
                  </span>
                )}
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block ${tipPosition}`}
                >
                  {columnName(start, period)}: {formatValue(value)} {valueLabel}
                </span>
                <span
                  className={`absolute -bottom-6 inset-x-0 whitespace-nowrap text-center text-[11px] ${
                    isCurrent ? "font-semibold text-ink" : "text-muted"
                  } ${hideOnPhone ? "hidden sm:block" : ""}`}
                >
                  {columnLabel(start, period)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-8 text-xs text-muted">{CAPTIONS[period]} Hover a column for details.</p>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>
          {description} per {period}, last {span}
        </caption>
        <thead>
          <tr>
            <th scope="col">{PERIODS[period].label}</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(({ start, value }) => (
            <tr key={start.getTime()}>
              <td>{columnName(start, period)}</td>
              <td>{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
