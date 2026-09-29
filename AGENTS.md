# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working on this repository.
Humans should start with [README.md](README.md).

## About the project and the owner

- **DoSprout**, a todo app styled after the "TaskPro" design in [moodboard/inspo.png](moodboard/inspo.png)
  (TaskPro is only the moodboard's name; the app is called DoSprout everywhere).
- The owner is a **beginner**. Keep code simple and readable, prefer plain solutions over clever ones,
  add short comments that explain *why*, and explain your changes in plain language.
  Don't add new libraries unless they clearly pay for themselves, and say why when you do.
- Pages: **Dashboard**, **Tasks** (list + board), **Goals**, **Time**, **Calendar**, **Settings**.
  (The "Coming soon" placeholder route `app/[section]` was removed once every page existed.)
  There is no login: everyone using the same backend shares one task list.

## Stack

| Part     | Tech                                                                        | Folder      | Port |
| -------- | --------------------------------------------------------------------------- | ----------- | ---- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript 5            | `frontend/` | 3000 |
| Backend  | Fastify 5, TypeScript 5 (run with `tsx`), SQLite via `@libsql/client` (Turso) | `backend/`  | 4000 |

- Node.js **22.13 or newer** is required (the tests use `node:sqlite`). Developed on Node 24, Windows 11.
- Other libraries: `lucide-react` (icons), `@dnd-kit/core` (drag & drop on the board and the calendar),
  `@fastify/cors`, `concurrently` (root, runs both apps with `npm run dev`).
- Database: `@libsql/client` talks to a local file (`file:data/todos.db`, the default), a Turso
  cloud database (`libsql://...`, used on Vercel), or `:memory:` (tests).
- The browser always calls `/api/...` on the website's own address (`lib/api.ts`). Locally,
  `next.config.ts` forwards `/api` to `BACKEND_URL` (default http://localhost:4000); on Vercel,
  vercel.json does the routing. `NEXT_PUBLIC_API_URL` is only for a backend on another domain.
- **Next.js 16 differs from older versions.** Before writing Next.js code, read the matching guide in
  `frontend/node_modules/next/dist/docs/` (see also `frontend/AGENTS.md`, which `next dev` regenerates).
  For example, `params`/`searchParams` are Promises, and `useSearchParams()` needs a `<Suspense>` boundary.

## Commands

Run from the repository root (they forward to the right folder):

```bash
npm install            # installs root, backend and frontend dependencies
npm run dev            # starts backend (4000) and frontend (3000) together
npm test               # backend API tests (node:test + fastify.inject)
npm run typecheck      # TypeScript checks for both apps
npm run lint           # ESLint for the frontend
npm run build          # production builds of both apps
npm run copy-to-turso  # copy local tasks into the Turso database set in backend/.env (--replace to overwrite)
```

Before saying a change is finished, run `npm test`, `npm run typecheck` and `npm run lint`,
and fix any failures. There are no frontend tests yet, so check UI changes in the browser.

## Environment variables

All optional; see the `.env.example` files. `.env` files are git-ignored (they hold the Turso token).

| Where                   | Variable                                | Default / meaning                                              |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `backend/.env`          | `PORT`, `HOST`                          | `4000`, `localhost`                                            |
| `backend/.env`          | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | `file:data/todos.db` / none. Empty counts as not set. Required on Vercel (the backend refuses to start with a file there). |
| `backend/.env`          | `CORS_ORIGIN`                           | `http://localhost:3000`; only matters if the website is on another domain |
| `backend/.env`          | `LOG_LEVEL`                             | `info`                                                         |
| `frontend/.env.local`   | `BACKEND_URL`                           | `http://localhost:4000`; where `next dev` forwards `/api`      |
| `frontend/.env.local`   | `NEXT_PUBLIC_API_URL`                   | unset (same domain); only for a backend on another domain      |

## Folder map

```
vercel.json          Vercel Services config: /api/(.*) -> backend, everything else -> frontend
backend/src/
  server.ts          starts the server; reads env vars (see backend/.env.example)
  build-app.ts       buildApp(): creates Fastify, CORS, routes (used by tests too). Not named
                     app.ts because Vercel would treat src/app.ts as the server entry point.
  db.ts              connect() + openDatabase(): runs MIGRATIONS, seeds example tasks on first run
  task-store.ts      TaskStore class: all task SQL (+ statusFromSubtasks, hasUnfinishedSubtasks, NOW)
  goal-store.ts      GoalStore class: all goal SQL
  time-store.ts      TimeStore class: all time-entry SQL (start / stop timer, manual entries)
  settings-store.ts  SettingsStore: the settings, one JSON object in a one-row table (withDefaults)
  backup-store.ts    BackupStore: export everything, import a backup (replaces all), delete all
  routes/tasks.ts    task HTTP routes + JSON-schema validation
  routes/goals.ts    goal HTTP routes + JSON-schema validation
  routes/time.ts     time-entry HTTP routes + JSON-schema validation
  routes/settings.ts settings, /export, /import (with the backup's JSON schema), /data
  types.ts           API data types (source of truth)
  copy-tasks.ts      copyTasks(): copies all tasks, subtasks, goals and time entries between two
                     databases (keeps ids)
  scripts/copy-to-turso.ts  `npm run copy-to-turso`: local file -> Turso database in backend/.env
  app.test.ts        API tests using an in-memory database
frontend/
  next.config.ts     forwards /api to the backend while developing (not on Vercel)
frontend/src/
  app/               pages: / (redirects to /tasks), /dashboard, /tasks, /goals, /time, /calendar,
                     /settings, layout.tsx (theme script in <head>)
  components/layout/ AppShell, Sidebar, TopBar (search box), Notifications (bell, list, pop-ups),
                     TimerPill (the running timer / break in the top bar), ThemeSync
  components/tasks/  TasksView (page logic), ListView, BoardView, TaskDialog, TaskMenu, badges,
                     task-actions (types), feedback (ErrorToast, LoadError, LoadingSkeleton;
                     shared with the calendar)
  components/calendar/ CalendarView: month grid, task bars from start day to due day, drag to move
  components/goals/  GoalsView (one card per goal: progress, target date, its tasks), GoalDialog
  components/time/   TimeView (now card, tracked-time chart, time per task, entry log), EntryDialog
  components/settings/ SettingsView: appearance, timer & calendar, notifications, task defaults, data
  components/inline-script.tsx  a <script> that runs before the first paint (theme)
  components/charts/ PeriodChart + usePeriodParam: the column chart with the Day/Week/Month switch
                     (Dashboard "Completed" and Time "Tracked time")
  components/dashboard/ DashboardView: summary cards, needs attention, completed-per-day chart,
                     open tasks by priority / tag
  hooks/use-tasks.ts loads tasks, goals AND time entries; create/update/delete for all of them
                     (optimistic for tasks); start/stop timer
  hooks/use-timer.ts the running timer + the focus/break cycle (in TasksProvider: `useTaskList().timer`)
  hooks/use-ticker.ts the time, ticking every second while a timer runs
  hooks/tasks-context.tsx  TasksProvider (in AppShell) shares useTasks() + a clock app-wide;
                     components read it with useTaskList()
  hooks/use-clock.ts wakes up exactly when the next start/reminder/due moment arrives
  hooks/use-notifications-read-at.ts  which notifications are read (localStorage)
  hooks/use-desktop-notifications.ts  desktop (system) notifications: on/off + sending
  hooks/use-dismiss.ts closes pop-up menus on outside click / Escape
  hooks/use-count-up.ts numbers that count up to their value (Dashboard cards)
  lib/api.ts         fetch wrapper for the backend
  lib/types.ts       copy of backend/src/types.ts
  lib/task-helpers.ts labels, sorting, search, date formatting, statusFromSubtasks,
                     hasUnfinishedSubtasks, isOverdue
  lib/notifications.ts works out notifications from the tasks (see below)
  lib/calendar.ts    local-day helpers: monthWeeks, taskDays, weekBars (bar rows), shiftTimestamp
  lib/dashboard.ts   the Dashboard's numbers: summarize, needsAttention, completedPer, openBy*
  lib/periods.ts     Period (day/week/month), PERIODS, periodStart, sumPer (for both charts)
  lib/time.ts        durations, formatDuration / formatClock, trackedByTask, trackedPer
  lib/theme.ts       THEME_STORAGE_KEY + THEME_SCRIPT (shared by the server layout and ThemeSync)
  lib/goals.ts       goal colors (GOAL_COLOR_CLASSES), goalProgress, targetStatus, sortGoals
```

## API

Base URL `/api` (locally also `http://localhost:4000/api`). JSON in and out. Errors look like
`{ "statusCode": 404, "error": "Not Found", "message": "Task not found" }`.

| Method | Path                                 | Body                                              | Returns          |
| ------ | ------------------------------------ | ------------------------------------------------- | ---------------- |
| GET    | `/health`                            |                                                   | `{ ok: true }`   |
| GET    | `/tasks`                             |                                                   | `Task[]`         |
| GET    | `/tasks/:id`                         |                                                   | `Task`           |
| POST   | `/tasks`                             | `title` (required), `description`, `status`, `priority`, `tag`, `startAt`, `dueAt`, `subtasks: string[]` | `Task` (201) |
| PATCH  | `/tasks/:id`                         | any task field and/or `position`                  | `Task`           |
| DELETE | `/tasks/:id`                         |                                                   | 204              |
| POST   | `/tasks/:id/subtasks`                | `{ title }`                                       | parent `Task` (201) |
| PATCH  | `/tasks/:id/subtasks/:subtaskId`     | `{ title?, done? }`                               | parent `Task`    |
| DELETE | `/tasks/:id/subtasks/:subtaskId`     |                                                   | parent `Task`    |
| GET    | `/goals`                             |                                                   | `Goal[]`         |
| GET    | `/goals/:id`                         |                                                   | `Goal`           |
| POST   | `/goals`                             | `title` (required), `description`, `color`, `targetDate` | `Goal` (201) |
| PATCH  | `/goals/:id`                         | any goal field                                    | `Goal`           |
| DELETE | `/goals/:id`                         | (its tasks are kept, with `goalId` set to null)   | 204              |
| GET    | `/time-entries`                      |                                                   | `TimeEntry[]` (newest first) |
| POST   | `/time-entries/start`                | `taskId`, `kind` (`"timer"` / `"focus"`)          | `TimeEntry` (201); stops a running one first |
| POST   | `/time-entries/stop`                 |                                                   | the stopped `TimeEntry`, or 404 if none runs |
| POST   | `/time-entries`                      | `startedAt`, `endedAt` (required), `taskId`, `note` (added by hand) | `TimeEntry` (201) |
| PATCH  | `/time-entries/:id`                  | `taskId`, `startedAt`, `endedAt`, `note`          | `TimeEntry`      |
| DELETE | `/time-entries/:id`                  |                                                   | 204              |
| GET    | `/settings`                          |                                                   | `Settings` (defaults filled in) |
| PATCH  | `/settings`                          | any settings (`notifications` merges per kind)    | `Settings`       |
| GET    | `/export`                            |                                                   | `Backup` (everything) |
| POST   | `/import`                            | a `Backup` (up to 20 MB); REPLACES all data       | `{ ok: true }`   |
| DELETE | `/data`                              | deletes all tasks, goals, time (settings stay)    | 204              |

400 errors, besides invalid bodies: `dueAt` earlier than `startAt`, `status: "done"` while the
task has unfinished subtasks (on POST: `status: "done"` together with `subtasks`), a `goalId`
that doesn't match a goal, a time entry's `taskId` that doesn't match a task, and a time entry
that ends before it starts.

Data model:
- `status`: `"todo" | "in_progress" | "done"`. `priority`: `"low" | "mid" | "high"`.
- `tag`: one free-text label (e.g. "Work"), `""` when there is none.
- `startAt` / `dueAt`: when the task starts / is due, as ISO timestamps with a timezone
  (e.g. `"2026-11-17T16:00:00.000Z"`), or `null`. Both are optional. The API stores them in UTC
  (`toUtcTimestamp` in `task-store.ts`) so they sort as plain text, and rejects `dueAt` earlier than `startAt`.
  The browser shows them in the viewer's local time. `toDateAndTime` / `fromDateAndTime` in
  `frontend/src/lib/task-helpers.ts` convert between timestamps and the dialog's date and time inputs.
  A task is overdue when `dueAt` has passed and it isn't done; it then shows red with an Overdue label.
- `completedAt`: set by the server when a task moves to `done`, cleared when it leaves `done`.
- `position`: order within a status column. Changing status without a position moves the task to the bottom.
- `goalId`: the goal a task belongs to (one at most), or `null`.
- `estimateMinutes`: how long a task should take (whole minutes, 1 to 60000), or `null`.
- **Time entries** (`TimeEntry`): `taskId` (or `null`), `kind` (`timer` / `focus` / `manual`),
  `startedAt`, `endedAt` (UTC timestamps; `endedAt` is `null` while the timer runs), `note`. At most
  one entry runs at a time. Deleting a task deletes its time entries.
- **Goals** (`Goal`): `title`, `description`, `color` (one of `GOAL_COLORS`), `targetDate` (a day,
  `"2026-12-31"`, no time; or `null`). A goal's progress is NOT stored: it's the share of its tasks
  that are done (`goalProgress` in `lib/goals.ts`). "Reached" = it has tasks and all are done;
  "late" = the target day has passed and it isn't reached.
- Subtask routes return the whole parent task so the frontend can just swap it in.
- **Subtasks drive the status:** after any subtask change, all done → `done`, some done → `in_progress`,
  none done → `todo` if it was `done`. `statusFromSubtasks` in `task-store.ts` has a copy in
  `frontend/src/lib/task-helpers.ts` (used by the dialog). Changing `status` directly is still allowed,
  except to `done` while a subtask is unfinished (the API answers 400). The frontend checks first with
  `hasUnfinishedSubtasks` and explains (checkbox, ⋮ menu, board drag and the dialog's Status field),
  so users rarely see the 400.

## Notifications

- Notifications are not stored. `notificationsFromTasks` (`lib/notifications.ts`) derives them from the
  tasks: "started" at `startAt`, "due tomorrow" 24 hours before `dueAt`, and "done" at `completedAt`.
  Starts and reminders only count if they fall after `createdAt` and before `completedAt`.
- `useClock` (via `TasksProvider`) re-renders exactly when the next start, reminder or due time
  arrives (and when the tab becomes visible again), so notifications and overdue styling appear
  on time without polling.
- Which ones are read is kept in the browser's localStorage (`use-notifications-read-at.ts`).
  Pop-ups only appear for events that happen while the app is open.
- Desktop notifications (`use-desktop-notifications.ts`) use the browser's Notification API. They're
  turned on from the bell's list (browsers only ask for permission after a click), and are sent only
  while a DoSprout tab is open but you're looking elsewhere. Notifying while the browser is closed
  would need web push (service worker + server job) and isn't built.

## Calendar

- A task covers every day from its start day to its due day (only one date = that day; no dates =
  not shown, with a note below the calendar). Days are in the viewer's timezone. Weeks start on
  Monday (`WEEK_STARTS_ON` in `lib/calendar.ts`).
- Each week row shows up to 3 bars per day, the rest as "+N more". Unfinished tasks get the rows
  first, then the ones that start first, then the ones due soonest.
- Dragging a bar shifts start and due by the same number of days (keeping times), measured from the
  day of the bar that was grabbed. Keyboard: Space, arrows (←/→ a day, ↑/↓ a week), Space.
- The month shown lives in the URL (`?month=2026-09`). Below `md` it shows a small month with dots
  instead of bars, plus the selected day's task list.

## Dashboard

- Everything is computed in the browser from the loaded tasks (`lib/dashboard.ts`); the helpers take
  `now` as an argument so the page stays pure. No chart library: the charts are plain HTML + Tailwind.
- The "Completed" chart counts `completedAt` per local day (last 14 days), week (last 12, starting
  on `WEEK_STARTS_ON`) or month (last 12), picked with the Day / Week / Month switch above it
  (`PERIODS` and `completedPer` in `lib/dashboard.ts`). The choice lives in the URL (`?per=week`),
  so the page is wrapped in `<Suspense>`. Chart rules followed here: one series so no legend,
  columns at most 24px wide and rounded only at the top, a number only on the busiest column
  (hover shows the rest), text in text colors (never the bar color), and a screen-reader table.
- Dashboard card effects (`dashboard-view.tsx`): all 7 cards fade and slide in one after another
  (`CARD_ENTRANCE` = `animate-card-in`, defined with its keyframes in `globals.css`), their numbers
  count up (`useCountUp`), and the progress bar and breakdown bars grow in (`animate-bar-grow`,
  row after row). Only the 5 top cards lift on hover with a shadow and a blue border
  (`CARD_EFFECTS`), because they're links; the two "Open tasks by ..." cards aren't clickable,
  so they must not lift. Every effect is switched off by the system's "reduce motion" setting
  (`motion-reduce:` classes, and `useCountUp` checks it too). Screen readers get the final numbers
  (`aria-label`s / `sr-only` text). `card-in` uses `backwards` fill mode on purpose: `both` would
  keep holding `transform` after the animation and block the hover lift.
- The "Tasks done" card links to `/tasks`. Status cards link to the Tasks list sections (`/tasks#status-todo`, `#status-in_progress`,
  `#status-done`; the ids are on the sections in `list-view.tsx`). The Overdue card jumps to the
  "Needs attention" card on the same page.

## Goals

- Goal colors: `GOAL_COLORS` = blue, orange, aqua, yellow, magenta, violet, **in that order**. They
  were checked with the dataviz skill's color-blindness validator (neighbors stay distinct); some are
  faint on white, so a goal's color is never shown without its name. The tokens are
  `--color-goal-*` in `globals.css` (blue reuses `--color-brand`).
- The task editor has a Goal field (it reads the goals with `useTaskList()`); `TaskDialog` takes
  `defaultGoalId` for "Add task" on a goal's card. Tasks show their goal with `GoalBadge`
  (list rows and board cards).
- Goal cards have `id="goal-<id>"`, so the Dashboard's Goals card links to `/goals#goal-3`.

## Time

- There's ONE running timer for everyone (no accounts), stored in the database. Starting one stops
  any other (`TimeStore.start`, in one batch). After every start / stop the frontend re-fetches the
  entries (`syncTimeEntries` in `use-tasks.ts`), because another browser may have changed the timer.
- Focus (Pomodoro): `useTimer` ends a focus entry by itself after `FOCUS_MINUTES` (saved as exactly
  25 minutes, even if the computer slept), then counts down a `BREAK_MINUTES` break. The break is
  NOT saved; it's only kept in memory, so it disappears on reload. Both send a desktop
  notification (`showDesktopMessage`) when those are turned on.
- Live clocks use `useTicker(active)`, which ticks every second only while something runs.
- Tracked time counts on the day an entry started (an entry across midnight isn't split).
- Tasks show `TimeBadge` (tracked time, "/ estimate", red when over; a blinking dot while running) in
  list rows and board cards; the ⋮ menu has Start / Stop timer; the task editor has an Estimate
  field (hours + minutes) and shows "Tracked so far".
- Manual entries (EntryDialog) start and end on the same day.

## Settings and dark mode

- `Settings` (see `types.ts`): `theme` (system / light / dark), `focusMinutes`, `breakMinutes`,
  `weekStartsOn` (0 Sunday / 1 Monday), `notifications` (started / dueSoon / done / focus),
  `defaultStartTime`, `defaultDueTime`, `defaultPriority`, `tagSuggestions`. Saved on the server
  (shared by everyone, no accounts). `DEFAULT_SETTINGS` exists in both `types.ts` files, and
  `withDefaults` fills in settings added later, so adding a setting needs no migration.
- Read settings with `useTaskList().settings`; change them with `saveSettings(partial)` (the
  screen updates first). Don't hard-code what's a setting: week start is a parameter of
  `monthWeeks`, `weekdayLabels`, `periodStart`, `sumPer`, `completedPer`, `trackedPer`; focus /
  break lengths come from settings in `useTimer`, TimerPill and the Time page.
- **Dark mode is only colors.** `globals.css` redefines every `--color-*` token for
  `:root[data-theme="dark"]` and for `prefers-color-scheme: dark` when data-theme isn't "light"
  (the same values twice, keep them in sync). So: use `bg-surface` (not `bg-white`) for cards,
  dialogs and inputs, and `bg-inverse` (not `bg-ink`) for dark tooltips / toasts with white text.
  `text-white` is fine on colored fills (brand buttons, the always-dark sidebar). The dark goal
  colors passed the dataviz validator on a dark surface.
- No white flash: `THEME_SCRIPT` runs in `<head>` (via `InlineScript`, the pattern from the Next.js
  guide "Preventing flash before hydration") and applies the theme copy from localStorage;
  `<html suppressHydrationWarning>`. `ThemeSync` applies the server setting once loaded and
  updates the copy.
- Backups: `GET /export` = `{ app, version: 1, settings, goals, tasks (with subtasks), timeEntries }`.
  `POST /import` validates it with a JSON schema and checks that links (task → goal, entry → task)
  point inside the file, then replaces everything in one batch (ids kept). The Settings page's
  "Delete all" needs `DELETE` typed first.

## Deployed on Vercel (read before changing the backend setup)

- ONE Vercel project with Vercel Services ([vercel.json](vercel.json)): `/api/(.*)` goes to the
  `backend` service, everything else to `frontend`. The backend sees the full path (`/api/tasks`).
  No service bindings: the frontend only calls the API from the browser, not from server code.
- Live at **https://dosprout.vercel.app** (production domain). Every push to `main` on GitHub
  deploys there. Env vars on Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- Four problems this project already works around. Don't undo these:
  1. **TypeScript 5.x in the backend.** Vercel's builder type-checks with the project's TypeScript
     and crashes with TypeScript 7 ("Cannot read properties of undefined (reading 'readFile')").
  2. **The backend service's `buildCommand` is only a type check.** If a build leaves `dist/`, Vercel
     reuses it at the function root without `package.json`, so `"type": "module"` is lost and the
     backend crashes ("Cannot use import statement outside a module"). Without `dist/`, Vercel
     bundles `src/server.ts` itself as `.mjs`.
  3. **Turso is opened with `@libsql/client/web`** (see `connect()` in `db.ts`). The default
     `@libsql/client` loads a native library that Vercel can't bundle; it's only used for local files.
  4. **No top-level `await` in `server.ts`** (or anything it imports). Vercel loads the backend with
     `require()`, which can't load such modules, and requests then hang. That's why `buildApp()`
     isn't async and opens the database inside a Fastify plugin, and why `app.listen()` isn't awaited.
- Deployment Protection is on: each deployment's own URL needs a Vercel login; the production
  domain is public. Look at a deployment's **Logs** tab for backend errors.

## Rules and conventions

- **Types exist in two places.** When you change the data shape, update `backend/src/types.ts`,
  `frontend/src/lib/types.ts`, the JSON schemas in `routes/tasks.ts`, and `task-store.ts` together.
- **Database changes:** add a new SQL string to the *end* of `MIGRATIONS` in `db.ts`.
  Never edit or reorder existing migrations, because people's databases have already run them.
  Statements are split on `;`, so don't put `;` inside text values. The version lives in the
  `schema_version` table (older local databases used `PRAGMA user_version`, which is read once).
- Keep SQL in the stores (`TaskStore`, `GoalStore`, `TimeStore`, `SettingsStore`, `BackupStore`).
  Keep route handlers thin. Validate every request body with a JSON schema.
- Store methods are `async` (the database may be in the cloud), so `await` them.
  Writes that must happen together go in one `db.batch([...], "write")`, which is a transaction
  and only one trip to the database.
  Don't rely on `ON DELETE CASCADE`: foreign key checks aren't on, so delete child rows yourself.
- Every new endpoint or behaviour needs a test in `backend/src/app.test.ts`.
- Backend imports use the `.js` extension (`import { x } from "./db.js"`). This is required by ESM/NodeNext.
- Frontend: components that use state or effects start with `"use client"`. Use the `@/` import alias.
  Read tasks and their actions with `useTaskList()`, not `useTasks()` directly (so there's one copy).
- React's lint rules forbid impure calls like `Date.now()` during render: use `now` from
  `useTaskList()`, or call them in event handlers and effects.
- Styling: Tailwind utility classes only. Colors come from the tokens in `frontend/src/app/globals.css`
  (`bg-brand`, `bg-surface`, `text-muted`, `bg-high-bg`, `border-line`, ...). Add a new token (with a
  dark value in both dark blocks) rather than hard-coding hex values. Check new UI in both themes.
  The font is Poppins.
- UI must work from 375px phones to desktop with no sideways page scrolling. The sidebar becomes a drawer below `lg`.
- Accessibility: real `<button>`s, `aria-label` on icon-only buttons, visible focus rings,
  and keyboard support (the board and the calendar support Space + arrow keys to move tasks).
- Search (`?q=`), view (`?view=board`), the calendar month (`?month=`) and the chart period on the
  Dashboard and Time pages (`?per=`) live in the URL.
  Update them with `window.history.replaceState`.
- User-facing error messages should say what to do next (see the "Couldn't load your tasks" screen).
- Don't commit `.env` files or `backend/data/` (the local SQLite database).

## Not built yet (possible next steps)

- User accounts and login (the sidebar "Log Out" is disabled, and the top bar shows "Guest").
- Live updates between browsers: each page loads the data once (and the timer re-syncs on
  start / stop), so changes made elsewhere show after a reload.
- Reordering cards within a board column (drag & drop currently only changes the column).
- Notifications while the browser is closed (web push).
- File attachments (shown in the moodboard).
- Per-person settings (they're shared until there are accounts).
- Frontend tests (e.g. Vitest + Testing Library, or Playwright).
