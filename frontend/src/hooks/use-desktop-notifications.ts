"use client";

import { useSyncExternalStore } from "react";
import type { AppNotification, NotificationKind } from "@/lib/notifications";

// Desktop (system) notifications, shown by the browser outside the page.
// They work while DoSprout is open in a tab, even in the background or minimized.
// (Notifications while the browser is closed would need web push and a server job.)

/**
 * - "unsupported": this browser can't show them (e.g. Android Chrome, iPhone Safari)
 * - "blocked":     you said "Block" when the browser asked; only the browser's site settings can undo that
 * - "off" / "on":  whether DoSprout should show them
 */
export type DesktopNotificationStatus = "unsupported" | "blocked" | "off" | "on";

// Your on/off choice, remembered in this browser. The browser's own permission is separate.
const STORAGE_KEY = "dosprout:desktop-notifications";

const TITLES: Record<NotificationKind, string> = {
  start: "Task started",
  "due-soon": "Due tomorrow",
  done: "Task done",
};

const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((listener) => listener());

function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function readChoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveChoice(choice: "on" | "off") {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Can't remember it (e.g. private window). It then only lasts until reload.
  }
}

function getStatus(): DesktopNotificationStatus {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && readChoice() === "on" ? "on" : "off";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks the browser for permission (it shows its own "Allow / Block" prompt) and turns them on. */
async function turnOn() {
  if (!isSupported()) return;
  if (Notification.permission !== "granted") await Notification.requestPermission();
  if (Notification.permission === "granted") saveChoice("on");
  notifyListeners();
}

function turnOff() {
  saveChoice("off");
  notifyListeners();
}

export function useDesktopNotifications() {
  // The server can't know about browser permissions, so it renders "unsupported" (shows nothing).
  const status = useSyncExternalStore(subscribe, getStatus, () => "unsupported" as const);
  return { status, turnOn, turnOff };
}

/**
 * Shows `notification` as a desktop notification if they're turned on and you're
 * not looking at DoSprout right now (then the in-app pop-up is enough).
 */
export function showDesktopNotification(notification: AppNotification, onClick: () => void) {
  if (getStatus() !== "on") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const desktop = new Notification(TITLES[notification.kind], {
      body: notification.message,
      // Same tag = the browser replaces instead of stacking a duplicate.
      tag: notification.id,
      icon: "/favicon.ico",
    });
    desktop.onclick = () => {
      window.focus();
      onClick();
      desktop.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker. Skip them there.
  }
}
