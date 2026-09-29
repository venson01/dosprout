// Shared by the server layout (app/layout.tsx) and ThemeSync, so it can't be a "use client" file.

/**
 * The theme is saved on the server (settings.theme), but those settings arrive a moment
 * after the page appears. So this browser also keeps a copy in localStorage.
 */
export const THEME_STORAGE_KEY = "dosprout:theme";

/**
 * Runs in <head> before anything is painted: applies the copy of the light / dark theme
 * from localStorage, so a dark-mode page doesn't flash white first. "system" needs
 * nothing: the CSS follows the device (see globals.css).
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
