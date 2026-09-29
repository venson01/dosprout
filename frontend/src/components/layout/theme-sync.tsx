"use client";

import { useLayoutEffect } from "react";
import { useTaskList } from "@/hooks/tasks-context";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import type { Theme } from "@/lib/types";

/** "light" / "dark" set data-theme on <html>; "system" removes it (the CSS follows the device). */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Can't remember it in this browser (e.g. a private window): the page still works.
  }
}

/** Keeps <html data-theme> in step with the saved setting. Renders nothing. */
export function ThemeSync() {
  const { settings, loadState } = useTaskList();

  // In development, React's Strict Mode resets <html>'s attributes once, removing what the
  // <head> script set; put the cached theme back. (Does nothing in production.)
  useLayoutEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark") document.documentElement.setAttribute("data-theme", cached);
    } catch {
      // No localStorage: the theme is applied once the settings arrive.
    }
  }, []);

  // Once the real settings are loaded (and whenever the theme changes), apply them.
  useLayoutEffect(() => {
    if (loadState === "ready") applyTheme(settings.theme);
  }, [settings.theme, loadState]);

  return null;
}
