"use client";

import { useEffect, useState } from "react";

/**
 * The current time (in milliseconds), updated every second while `active` is true.
 * Used by running timers. When not active it doesn't tick, so idle pages don't re-render.
 */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}
