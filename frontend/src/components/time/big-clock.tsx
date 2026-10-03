/**
 * Font sizes for the big clock: one for short times like "19:45", one for long ones like
 * "1:23:45" (two more characters to fit). `cqw` / `cqh` = 1% of the surrounding
 * container's width / height (Tailwind's `@container` classes).
 */
const SIZES = {
  // The Time page's card: follows the card's width, up to 9rem / 8rem.
  card: ["text-[min(36cqw,9rem)]", "text-[min(25cqw,8rem)]"],
  // The pop-out window is short, so it also has to fit the height (needs `@container-size`).
  window: ["text-[min(36cqw,80cqh)]", "text-[min(25cqw,80cqh)]"],
} as const;

/** The big countdown / count-up clock, shared by the Time page and the pop-out timer. */
export function BigClock({ time, fit = "card" }: { time: string; fit?: keyof typeof SIZES }) {
  const [short, long] = SIZES[fit];
  return (
    <p className={`${time.length <= 5 ? short : long} leading-none font-semibold tabular-nums`} aria-live="off">
      {time}
    </p>
  );
}
