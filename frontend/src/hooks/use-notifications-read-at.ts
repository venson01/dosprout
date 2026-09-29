"use client";

import { useSyncExternalStore } from "react";

// Notifications newer than this time are "unread". It's saved in this browser
// (localStorage) so reloading the page doesn't mark everything unread again.
const STORAGE_KEY = "dosprout:notifications-read-at";

// Used when the browser blocks localStorage (e.g. some private windows).
let memoryReadAt: number | null = null;
const listeners = new Set<() => void>();

function getReadAt(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return Number(stored);
    // First visit: start with nothing unread, so old events don't pile up.
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    return now;
  } catch {
    memoryReadAt ??= Date.now();
    return memoryReadAt;
  }
}

/** Marks every notification up to now as read. */
export function markNotificationsRead() {
  const now = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    memoryReadAt = now;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Also update when another tab marks notifications as read.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** When notifications were last read, or null while the page is still loading. */
export function useNotificationsReadAt(): number | null {
  // The server can't see localStorage, so it renders with null.
  return useSyncExternalStore(subscribe, getReadAt, () => null);
}
