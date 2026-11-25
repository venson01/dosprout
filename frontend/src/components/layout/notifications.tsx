"use client";

import {
  AlarmClock,
  Bell,
  BellRing,
  CalendarClock,
  CircleCheck,
  ExternalLink,
  Hourglass,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showDesktopNotification, useDesktopNotifications } from "@/hooks/use-desktop-notifications";
import { useDismiss } from "@/hooks/use-dismiss";
import { markNotificationsRead, useNotificationsReadAt } from "@/hooks/use-notifications-read-at";
import { useTaskList } from "@/hooks/tasks-context";
import { linkLabel } from "@/lib/task-helpers";
import type { Settings } from "@/lib/types";
import {
  isAboutStarting,
  notificationsFromTasks,
  timeAgo,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications";

const KIND_STYLES: Record<NotificationKind, { icon: LucideIcon; className: string; label: string }> = {
  "starting-soon": { icon: Hourglass, className: "bg-brand-soft text-brand", label: "Starting soon" },
  start: { icon: CalendarClock, className: "bg-brand-soft text-brand", label: "Started" },
  "due-soon": { icon: AlarmClock, className: "bg-mid-bg text-mid", label: "Due tomorrow" },
  done: { icon: CircleCheck, className: "bg-low-bg text-low", label: "Done" },
};

// Pop-ups hide themselves after this long (except ones with a link to open, see Popup).
const POPUP_MS = 6000;

// Which setting switches each kind of notification on or off.
const KIND_SETTING: Record<NotificationKind, keyof Settings["notifications"]> = {
  "starting-soon": "startingSoon",
  start: "started",
  "due-soon": "dueSoon",
  done: "done",
};

/**
 * The link to offer with a notification: a task's link, but only around its start
 * (a reminder or "has started"), not when it's due or done.
 */
function linkToOpen(notification: AppNotification): string | null {
  return isAboutStarting(notification) && notification.task.link ? notification.task.link : null;
}

/**
 * The bell in the top bar (with the number of unread notifications and a list),
 * plus pop-ups for things that happen while the app is open.
 */
export function Notifications() {
  const router = useRouter();
  const { tasks, loadState, now, settings } = useTaskList();
  // Only the kinds switched on in Settings.
  const kinds = settings.notifications;
  const reminderMinutes = settings.reminderMinutes;
  const notifications = useMemo(
    () =>
      notificationsFromTasks(tasks, now, reminderMinutes).filter((n) => kinds[KIND_SETTING[n.kind]]),
    [tasks, now, reminderMinutes, kinds],
  );
  const readAt = useNotificationsReadAt();
  const unread = readAt === null ? 0 : notifications.filter((n) => n.at > readAt).length;

  const [open, setOpen] = useState(false);
  // The pop-ups showing right now (newest first, at most 3).
  const [popups, setPopups] = useState<AppNotification[]>([]);
  // When the list was opened, and what was unread at that moment (so those stay marked "new").
  const [openedAt, setOpenedAt] = useState(0);
  const [newSince, setNewSince] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  function toggle() {
    if (!open) {
      setOpenedAt(Date.now());
      setNewSince(readAt);
      markNotificationsRead();
      // The list shows the same things (with their "Open link" buttons), and pop-ups
      // with a link would otherwise cover it.
      setPopups([]);
    }
    setOpen(!open);
  }

  // Shows the task by searching for its title on the Tasks page.
  function showTask(notification: AppNotification) {
    setOpen(false);
    router.push(`/tasks?q=${encodeURIComponent(notification.task.title)}`);
  }

  // Pop-ups: compare with the notifications we've already seen. Anything
  // that existed before you opened the app only goes into the list.
  const [seenIds, setSeenIds] = useState<Set<string> | null>(null);
  if (loadState === "ready") {
    if (seenIds === null) {
      setSeenIds(new Set(notifications.map((n) => n.id)));
    } else {
      const fresh = notifications.filter((n) => !seenIds.has(n.id));
      if (fresh.length > 0) {
        setSeenIds(new Set([...seenIds, ...fresh.map((n) => n.id)]));
        // A newer pop-up about the same task replaces the older one (e.g. "starts in 2 min"
        // replaces "starts in 10 min"), so reminders don't pile up.
        const freshTaskIds = new Set(fresh.map((n) => n.task.id));
        setPopups((current) =>
          [...fresh, ...current.filter((n) => !freshTaskIds.has(n.task.id))].slice(0, 3),
        );
      }
    }
  }
  const dismissPopup = useCallback(
    (id: string) => setPopups((current) => current.filter((n) => n.id !== id)),
    [],
  );

  // Every new pop-up is also sent as a desktop notification (if they're turned on
  // and you're looking at another tab or app). The ref remembers which were sent.
  const sentToDesktop = useRef(new Set<string>());
  useEffect(() => {
    for (const notification of popups) {
      if (sentToDesktop.current.has(notification.id)) continue;
      sentToDesktop.current.add(notification.id);
      const link = linkToOpen(notification);
      // Clicking it opens the task's link (e.g. the video call) when it's about to start.
      // Browsers only let a page open a new tab right after a click, and a click on a
      // desktop notification counts, so this is the moment to do it.
      showDesktopNotification(notification, () =>
        link
          ? window.open(link, "_blank", "noopener,noreferrer")
          : router.push(`/tasks?q=${encodeURIComponent(notification.task.title)}`),
      );
    }
  }, [popups, router]);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={toggle}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          aria-expanded={open}
          className="relative grid size-9 place-items-center rounded-full text-ink hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-high px-1 text-[10px] font-semibold leading-none text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          // Full width under the top bar on phones, a drop-down under the bell on bigger screens.
          <div className="fixed inset-x-4 top-16 z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Notifications</h2>
            <DesktopNotificationsSetting />
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Nothing yet. You&apos;ll see a notification here when a task is about to start,
                starts, is due tomorrow, or is done.
              </p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow
                      notification={notification}
                      when={timeAgo(notification.at, openedAt)}
                      isNew={newSince !== null && notification.at > newSince}
                      onClick={() => showTask(notification)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Screen readers announce new pop-ups because of aria-live. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-20 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {popups.map((notification) => (
          <Popup
            key={notification.id}
            notification={notification}
            onOpen={() => {
              dismissPopup(notification.id);
              showTask(notification);
            }}
            onDismiss={dismissPopup}
          />
        ))}
      </div>
    </>
  );
}

/** The row at the top of the list for turning desktop notifications on or off. */
export function DesktopNotificationsSetting() {
  const { status, turnOn, turnOff } = useDesktopNotifications();
  if (status === "unsupported") return null;

  return (
    <div className="flex items-center gap-3 border-b border-line bg-page px-4 py-2.5 text-xs">
      <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
      {status === "blocked" ? (
        <p className="text-muted">
          Desktop notifications are blocked. To allow them, click the icon to the left of the
          address bar and allow notifications for this site.
        </p>
      ) : (
        <>
          <p className="flex-1 text-muted">
            {status === "on"
              ? "Desktop notifications are on while DoSprout is open in a tab."
              : "Get desktop notifications, even when DoSprout is in the background."}
          </p>
          <button
            type="button"
            onClick={status === "on" ? turnOff : turnOn}
            className={`shrink-0 rounded-md px-2.5 py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              status === "on"
                ? "text-brand hover:bg-brand-soft"
                : "bg-brand text-white hover:bg-brand-hover"
            }`}
          >
            {status === "on" ? "Turn off" : "Turn on"}
          </button>
        </>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const { icon: Icon, className } = KIND_STYLES[kind];
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function NotificationRow({
  notification,
  when,
  isNew,
  onClick,
}: {
  notification: AppNotification;
  when: string;
  isNew: boolean;
  onClick: () => void;
}) {
  const link = linkToOpen(notification);
  return (
    <div className="flex items-start hover:bg-page">
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-start gap-3 py-2.5 pl-4 text-left outline-none focus-visible:bg-page ${link ? "pr-2" : "pr-4"}`}
      >
        <KindIcon kind={notification.kind} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{notification.message}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {KIND_STYLES[notification.kind].label} · {when}
          </span>
        </span>
        {isNew && (
          <>
            <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
            <span className="sr-only">(new)</span>
          </>
        )}
      </button>
      {link && (
        <div className="py-2.5 pr-4">
          <OpenLinkButton link={link} />
        </div>
      )}
    </div>
  );
}

/** "Open link" (e.g. join the video call), in a new tab. */
function OpenLinkButton({ link, onOpened }: { link: string; onOpened?: () => void }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpened}
      title={link}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white outline-none hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <ExternalLink className="size-3.5" aria-hidden />
      Open link
      <span className="sr-only">({linkLabel(link)}, opens in a new tab)</span>
    </a>
  );
}

function Popup({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onDismiss: (id: string) => void;
}) {
  const link = linkToOpen(notification);
  // Hide by itself after a few seconds, unless it has a link to open: browsers don't
  // let a page open a link by itself, so it waits for your click (or the X).
  useEffect(() => {
    if (link) return;
    const timer = setTimeout(() => onDismiss(notification.id), POPUP_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss, link]);

  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg">
      <KindIcon kind={notification.kind} />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="block text-xs font-medium text-muted">
          {KIND_STYLES[notification.kind].label}
        </span>
        <span className="block text-sm">{notification.message}</span>
      </button>
      {link && <OpenLinkButton link={link} onOpened={() => onDismiss(notification.id)} />}
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
        className="rounded-md p-1 text-muted hover:bg-page hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
