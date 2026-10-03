"use client";

import { useEffect, useState } from "react";

/**
 * The current time (in milliseconds), updated every second while `active` is true.
 * Used by running timers. When not active it doesn't tick, so idle pages don't re-render.
 *
 * `clockWindow` picks which window's timer does the ticking. The pop-out timer passes its
 * own window: browsers slow a minimized tab's timers down to about once a minute, but the
 * pop-out is still on screen, so its timer keeps ticking every second.
 */
export function useTicker(active: boolean, clockWindow?: Window): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const source = clockWindow ?? window;
    const interval = source.setInterval(() => setNow(Date.now()), 1000);
    return () => source.clearInterval(interval);
  }, [active, clockWindow]);
  return now;
}
