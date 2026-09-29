"use client";

import { useEffect, useRef, useState } from "react";

/** True when the viewer asked their device for less motion (a system setting). */
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Returns a number that counts up (or down) to `target` over `duration` milliseconds,
 * for the Dashboard cards. When `target` changes later (e.g. a task gets done), it
 * counts from the number on screen to the new one. With "reduce motion" turned on,
 * it jumps straight to the number.
 */
export function useCountUp(target: number, duration = 800): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  // The number on screen right now, so the next count starts from there.
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    // Browsers pause animations in background tabs; there's nothing to watch there, so skip it.
    const instant = prefersReducedMotion() || document.hidden;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function step(time) {
      const progress = instant ? 1 : Math.min(1, Math.max(0, (time - startedAt) / duration));
      // Ease out: counts fast at first, then slows down as it reaches the number.
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}
