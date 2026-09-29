# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working on this repository.
Humans should start with [README.md](README.md).

## About the project and the owner

- **DoSprout**, a todo app styled after the "TaskPro" design in [moodboard/inspo.png](moodboard/inspo.png)
  (TaskPro is only the moodboard's name; the app is called DoSprout everywhere).
- The owner is a **beginner**. Keep code simple and readable, prefer plain solutions over clever ones,
  add short comments that explain *why*, and explain your changes in plain language.
  Don't add new libraries unless they clearly pay for themselves, and say why when you do.

## Stack

| Part     | Tech                                                                 | Folder      | Port |
| -------- | -------------------------------------------------------------------- | ----------- | ---- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript       | `frontend/` | 3000 |
| Backend  | Fastify 5, TypeScript (run with `tsx`), SQLite via `@libsql/client` (Turso) | `backend/`  | 4000 |

- Node.js **22.13 or newer** is required (the tests use `node:sqlite`). Developed on Node 24, Windows 11.
- Other libraries: `lucide-react` (icons), `@dnd-kit/core` (board drag & drop), `@fastify/cors`.
- Database: `@libsql/client` talks to a local file (`file:data/todos.db`, the default), a Turso
  cloud database (`libsql://...`, used on Vercel), or `:memory:` (tests). Set by `TURSO_DATABASE_URL`
  and `TURSO_AUTH_TOKEN`.
- Deployed as two Vercel projects (Root Directory `backend` and `frontend`). See "Deploy to Vercel" in README.md.
- **Next.js 16 differs from older versions.** Before writing Next.js code, read the matching guide in
  `frontend/node_modules/next/dist/docs/` (see also `frontend/AGENTS.md`, which `next dev` regenerates).
  For example, `params`/`searchParams` are Promises, and `useSearchParams()` needs a `<Suspense>` boundary.

## Commands

Run from the repository root (they forward to the right folder):

```bash
npm install          # installs root, backend and frontend dependencies
npm run dev          # starts backend (4000) and frontend (3000) together
npm test             # backend API tests (node:test + fastify.inject)
npm run typecheck    # TypeScript checks for both apps
npm run lint         # ESLint for the frontend
npm run build        # production builds of both apps
```

Before saying a change is finished, run `npm test`, `npm run typecheck` and `npm run lint`,
and fix any failures.

## Folder map

```
backend/src/
  server.ts          starts the server; reads env vars (see backend/.env.example)
  build-app.ts       buildApp(): creates Fastify, CORS, routes (used by tests too). Not named
                     app.ts because Vercel would treat src/app.ts as the server entry point.
  db.ts              opens the database, runs MIGRATIONS, seeds example tasks on first run
  task-store.ts      TaskStore class: ALL SQL lives here
  routes/tasks.ts    HTTP routes + JSON-schema validation
  types.ts           API data types (source of truth)
  app.test.ts        API tests using an in-memory database
frontend/src/
  app/               pages: /tasks (main), /[section] (coming-soon pages), layout.tsx
  components/layout/ AppShell, Sidebar, TopBar (search box)
  components/tasks/  TasksView (page logic), ListView, BoardView, TaskDialog, TaskMenu, badges
  hooks/use-tasks.ts loads tasks + create/update/delete, with optimistic updates
  lib/api.ts         fetch wrapper for the backend
  lib/types.ts       copy of backend/src/types.ts
  lib/task-helpers.ts labels, sorting, search, date formatting
```

## API

Base URL `http://localhost:4000/api`. JSON in and out. Errors look like
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

Data model:
- `status`: `"todo" | "in_progress" | "done"`. `priority`: `"low" | "mid" | "high"`.
- `tag`: one free-text label (e.g. "Work"), `""` when there is none.
- `startAt` / `dueAt`: when the task starts / is due, as ISO timestamps with a timezone
  (e.g. `"2026-11-17T16:00:00.000Z"`), or `null`. Both are optional. The API stores them in UTC
  (`toUtcTimestamp` in `task-store.ts`) so they sort as plain text, and rejects `dueAt` earlier than `startAt`.
  The browser shows them in the viewer's local time. `toDateAndTime` / `fromDateAndTime` in
  `frontend/src/lib/task-helpers.ts` convert between timestamps and the dialog's date and time inputs.
  A task is overdue when `dueAt` has passed and it isn't done.
- `position`: order within a status column. Changing status without a position moves the task to the bottom.
- Subtask routes return the whole parent task so the frontend can just swap it in.
- Subtasks drive the status: after any subtask change, all done → `done`, some done → `in_progress`,
  none done → `todo` if it was `done`. `statusFromSubtasks` in `task-store.ts` has a copy in
  `frontend/src/lib/task-helpers.ts` (used by the dialog). Changing `status` directly is still allowed.

## Rules and conventions

- **Types exist in two places.** When you change the data shape, update `backend/src/types.ts`,
  `frontend/src/lib/types.ts`, the JSON schemas in `routes/tasks.ts`, and `task-store.ts` together.
- **Database changes:** add a new SQL string to the *end* of `MIGRATIONS` in `db.ts`.
  Never edit or reorder existing migrations, because people's databases have already run them.
  Statements are split on `;`, so don't put `;` inside text values. The version lives in the
  `schema_version` table (older local databases used `PRAGMA user_version`, which is read once).
- Keep SQL in `TaskStore`. Keep route handlers thin. Validate every request body with a JSON schema.
- `TaskStore` methods are `async` (the database may be in the cloud), so `await` them.
  Writes that must happen together go in one `db.batch([...], "write")`, which is a transaction
  and only one trip to the database.
  Don't rely on `ON DELETE CASCADE`: foreign key checks aren't on, so delete child rows yourself.
- Every new endpoint or behaviour needs a test in `backend/src/app.test.ts`.
- Backend imports use the `.js` extension (`import { x } from "./db.js"`). This is required by ESM/NodeNext.
- Frontend: components that use state or effects start with `"use client"`. Use the `@/` import alias.
- Styling: Tailwind utility classes only. Colors come from the tokens in `frontend/src/app/globals.css`
  (`bg-brand`, `text-muted`, `bg-high-bg`, `border-line`, ...). Add a new token rather than hard-coding hex values.
  The font is Poppins.
- UI must work from 375px phones to desktop with no sideways page scrolling. The sidebar becomes a drawer below `lg`.
- Accessibility: real `<button>`s, `aria-label` on icon-only buttons, visible focus rings,
  and keyboard support (the board supports Space + arrow keys to move cards).
- Search (`?q=`) and view (`?view=board`) live in the URL. Update them with `window.history.replaceState`.
- User-facing error messages should say what to do next (see the "Couldn't load your tasks" screen).
- Don't commit `.env` files or `backend/data/` (the local SQLite database).

## Not built yet (possible next steps)

- User accounts and login (the sidebar "Log Out" is disabled, and the top bar shows "Guest").
- Dashboard, Goals, Time, Calendar and Settings pages (they currently show "Coming soon").
- Reordering cards within a board column (drag & drop currently only changes the column).
- File attachments (shown in the moodboard) and dark mode.
- Frontend tests (e.g. Vitest + Testing Library, or Playwright).
