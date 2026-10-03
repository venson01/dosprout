"use client";

import { useSyncExternalStore } from "react";

// The pop-out timer: a small window that stays on top of other windows, even when the
// browser is minimized. It uses the Document Picture-in-Picture API, which only Chrome and
// Edge have so far (TypeScript doesn't know about it yet, hence the types below).
// Browsers only open it after a click, so it can't pop up by itself when you minimize.

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

// The open pop-out window, or null. Kept outside React so it survives changing pages.
let timerWindow: Window | null = null;

const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isSupported() {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/** The new window starts empty, so copy the page's styles (Tailwind, fonts, colors) into it. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      target.head.append(style);
    } catch {
      // Stylesheets from another website can't be read; link to them instead.
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.append(link);
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.body.className = document.body.className;
}

/** Opens the pop-out timer (or brings it to the front). Call it from a click. */
export async function openTimerWindow() {
  if (!window.documentPictureInPicture) return;
  if (timerWindow) {
    timerWindow.focus();
    return;
  }
  const popout = await window.documentPictureInPicture.requestWindow({ width: 320, height: 240 });
  popout.document.title = "DoSprout timer";
  copyStyles(popout.document);

  // Follow the app's light / dark theme (ThemeSync sets data-theme on the main page).
  const syncTheme = () => {
    const theme = document.documentElement.dataset.theme;
    if (theme) popout.document.documentElement.dataset.theme = theme;
    else delete popout.document.documentElement.dataset.theme;
  };
  syncTheme();
  const themeWatcher = new MutationObserver(syncTheme);
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // "pagehide" fires when the window is closed (by you, or because the tab closed).
  popout.addEventListener("pagehide", () => {
    themeWatcher.disconnect();
    timerWindow = null;
    notifyListeners();
  });

  timerWindow = popout;
  notifyListeners();
}

export function closeTimerWindow() {
  timerWindow?.close();
}

/** The open pop-out window (or null), and whether this browser can open one. */
export function useTimerWindow() {
  const popout = useSyncExternalStore(subscribe, () => timerWindow, () => null);
  // The server can't know the browser, so it says "not supported" (renders no button).
  const supported = useSyncExternalStore(subscribe, isSupported, () => false);
  return { popout, supported };
}
