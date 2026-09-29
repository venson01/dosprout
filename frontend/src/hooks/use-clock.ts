"use client";

import { useEffect, useState } from "react";

// Browsers can't wait longer than about 24 days in one setTimeout,
// so for far-away moments, wake up once a day and check again.
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the current time (in milliseconds) and updates it exactly when the
 * next of `moments` arrives, instead of ticking every second. This is how due
 * dates turn red and notifications appear on time without reloading the page.
 */
export function useClock(moments: number[]): number {
  const [now, setNow] = useState(() => Date.now());
  const next = Math.min(Infinity, ...moments.filter((moment) => moment > now));

  // Sleep until the next moment.
  useEffect(() => {
    if (next === Infinity) return;
    // A few extra milliseconds so the moment has definitely passed when we wake up.
    const wait = Math.min(next - Date.now() + 50, MAX_WAIT_MS);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(wait, 0));
    return () => clearTimeout(timer);
  }, [next, now]);

  // Timers can be paused while the computer sleeps, so also check again
  // whenever you come back to this tab.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") setNow(Date.now());
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return now;
}
