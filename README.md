# DoSprout

DoSprout is a simple todo app with a **Next.js + Tailwind CSS** frontend and a **Fastify** backend that saves
tasks in a **SQLite** database (a local file while developing, [Turso](https://turso.tech) when
deployed on Vercel). The design is based on [moodboard/inspo.png](moodboard/inspo.png).

**Live version: [dosprout.vercel.app](https://dosprout.vercel.app)**

## Features

- **Dashboard**: how your tasks are going at a glance. The % done, counts per status, what's
  overdue or due in the next 7 days, a chart of tasks completed per day, week or month, and open
  tasks by priority and by tag.
- Tasks grouped into **To Do / In Progress / Done**.
- **List view** and **Board view**. On the board you can drag cards between columns
  (or use the keyboard: Space, arrow keys, Space).
- **Calendar**: a month view where each task is a bar from its start day to its due day.
  Click a day to add a task, click a bar to edit it, drag a bar to move it to other days.
  On phones it shows a small month with dots and the chosen day's tasks below.
- Tags (Work, Health, ...) and priorities (High / Mid / Low).
- Start and due dates, each with a time. When the due time passes, the task turns red with an
  **Overdue** label, right away, without reloading the page.
- **Subtasks** with a progress bar. Ticking them moves the task to In Progress, and ticking the
  last one marks it Done. A task can only be marked done once all its subtasks are.
- **Notifications** (the bell at the top): when a task starts, a day before it's due, and when
  it's done. Turn on **desktop notifications** in the bell's list to get them while you're in
  another tab or app (DoSprout needs to stay open in a tab).
- Search, and sorting by start date, due date or priority.
- Works on phones, tablets and desktops.

> The app has no login yet, so everyone who uses the same backend shares one task list,
> including everyone who opens the live version.

## What you need

- [Node.js](https://nodejs.org/) **version 22.13 or newer** (check with `node -v`)

## Run it

Open a terminal in this folder and run:

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser.

`npm run dev` starts both parts at once:

- the backend (API) on http://localhost:4000
- the frontend (website) on http://localhost:3000. It forwards everything under `/api` to the backend.

Press `Ctrl + C` in the terminal to stop them.

The first time the backend starts, it creates the database file `backend/data/todos.db`
and adds a few example tasks. To start over with a fresh database, stop the app and delete the
`backend/data` folder.

If `backend/.env` contains Turso settings (see [Deploy to Vercel](#deploy-to-vercel)), the backend
uses that cloud database instead of the local file, also while developing.

## Useful commands

| Command                  | What it does                                                  |
| ------------------------ | ------------------------------------------------------------- |
| `npm run dev`            | Start backend + frontend for development                      |
| `npm test`               | Run the backend tests                                         |
| `npm run typecheck`      | Check both apps for TypeScript errors                         |
| `npm run lint`           | Check the frontend code style                                 |
| `npm run build`          | Build both apps for production                                |
| `npm run copy-to-turso`  | Copy the tasks from the local database to Turso (see below)   |

## Project structure

```
backend/     Fastify API + database code    (see backend/src)
frontend/    Next.js website                (see frontend/src)
moodboard/   Design inspiration
vercel.json  How Vercel deploys the two parts as one website
AGENTS.md    Notes for AI coding assistants (also a good technical overview)
```

## Settings (optional)

Both apps work without any configuration. To change something:

- Backend: copy `backend/.env.example` to `backend/.env` and edit it
  (port, database: `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`, allowed websites, log level).
- Frontend: copy `frontend/.env.example` to `frontend/.env.local` and edit it
  (`BACKEND_URL`, where the backend runs while developing).

`.env` files hold secrets like the Turso token. Git ignores them, so they're never committed.
Restart `npm run dev` after changing them.

## Troubleshooting

- **"Couldn't load your tasks"**
  - On your computer: the backend isn't running. Start both parts with `npm run dev` from this folder.
  - On Vercel: open the project's **Logs** tab and look for red errors.
- **"Port 3000/4000 is already in use"**: another copy is still running. Close the other terminal,
  or change the port in the `.env` files.
- **A task can't be ticked off as done**: it still has unfinished subtasks. Tick those off first
  (the last one marks the task done by itself).
- **No desktop notifications**: check that they're turned on in the bell's list, that your browser
  allows notifications for the site, and that Windows **Focus / Do Not Disturb** is off.
  DoSprout has to be open in a tab.
- **`node:sqlite` not found** (when running `npm test`): your Node.js is too old.
  Install the current LTS version.

## Deploy to Vercel

The whole app deploys as **one Vercel project** using Vercel Services (beta, available on all
plans). [vercel.json](vercel.json) defines two services and sends traffic to them:

| Address         | Goes to                             |
| --------------- | ----------------------------------- |
| `/api/...`      | `backend` (Fastify, `backend/`)     |
| everything else | `frontend` (Next.js, `frontend/`)   |

Both share one domain, so the website simply calls `/api/...` (no CORS or API address to set up).
Vercel can't keep a database file, so the deployed backend stores tasks in a free
[Turso](https://turso.tech) database instead (Turso is SQLite in the cloud).

Before you start, push this repository to GitHub.

**1. Create the database**

1. Sign up at [turso.tech](https://turso.tech) and create a database (for example `dosprout`).
   Pick the region **AWS US East (Virginia)**, close to where Vercel runs the backend.
2. Copy its **URL**. It looks like `libsql://dosprout-yourname.aws-us-east-1.turso.io`.
3. Create a **token** for it and copy that too. Treat the token like a password.

**Optional: move your local tasks to Turso.** Put the URL and token in `backend/.env`
(copy `backend/.env.example`), then run:

```bash
npm run copy-to-turso
```

If Turso already has tasks (e.g. the example tasks), it stops without changing anything.
Run `npm run copy-to-turso -- --replace` to delete those and copy yours instead.

**2. Create the Vercel project**

1. On [vercel.com](https://vercel.com), click **Add New → Project** and import the repository.
   Leave **Root Directory** as the repository root: Vercel reads `vercel.json` and finds both services.
2. Under **Environment Variables**, add:
   - `TURSO_DATABASE_URL` = the URL from step 1
   - `TURSO_AUTH_TOKEN` = the token from step 1
3. Click **Deploy**.

**3. Check it**

- `<your address>/api/health` should show `{"ok":true}`.
- `<your address>/tasks` should show your tasks.

**After that**

- Every push to the `main` branch on GitHub deploys a new version automatically.
- If you change an environment variable, open **Deployments** and **Redeploy**, because changes
  only take effect after a new deployment.
- Vercel's **Deployment Protection** asks for a Vercel login on each deployment's own address
  (like `dosprout-abc123-yourteam.vercel.app`). Your production address stays public. To change
  this, go to **Settings → Deployment Protection**.
- If the backend fails on Vercel but works on your computer, see the "Deployed on Vercel" notes in
  [AGENTS.md](AGENTS.md). They explain four Vercel-specific problems this project already works around.
- To try the deployed setup on your computer, install the Vercel CLI and run `vercel dev`
  in the repository root. It runs both services together, the same way as on Vercel.
