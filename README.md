# DoSprout

DoSprout is a simple todo app with a **Next.js + Tailwind CSS** frontend and a **Fastify** backend that saves
tasks in a **SQLite** database (a local file while developing, [Turso](https://turso.tech) when
deployed on Vercel). The design is based on [moodboard/inspo.png](moodboard/inspo.png).

Features:

- Tasks grouped into **To Do / In Progress / Done**
- **List view** and **Board view**. On the board you can drag cards between columns.
- Tags (Work, Health, ...) and priorities (High / Mid / Low)
- Start and due dates, each with a time. Overdue tasks turn red.
- **Subtasks** with a progress bar. Ticking them moves the task to In Progress / Done.
- **Notifications** (the bell at the top): when a task starts, a day before it's due, and when it's done.
  Overdue tasks turn red. Turn on **desktop notifications** in the bell's list to get them
  while you're in another tab or app (DoSprout needs to stay open in a tab).
- Search, and sorting by start date, due date or priority
- Works on phones, tablets and desktops

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
- the frontend (website) on http://localhost:3000

Press `Ctrl + C` in the terminal to stop them.

The first time the backend starts, it creates the database file `backend/data/todos.db`
and adds a few example tasks. To start over with a fresh database, stop the app and delete the
`backend/data` folder.

## Useful commands

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start backend + frontend for development        |
| `npm test`          | Run the backend tests                           |
| `npm run typecheck` | Check both apps for TypeScript errors           |
| `npm run lint`      | Check the frontend code style                   |
| `npm run build`     | Build both apps for production                  |

## Project structure

```
backend/     Fastify API + database code    (see backend/src)
frontend/    Next.js website                  (see frontend/src)
moodboard/   Design inspiration
AGENTS.md    Notes for AI coding assistants (also a good technical overview)
```

## Settings (optional)

Both apps work without any configuration. To change ports or URLs:

- Backend: copy `backend/.env.example` to `backend/.env` and edit it.
- Frontend: copy `frontend/.env.example` to `frontend/.env.local` and edit it.

## Troubleshooting

- **"Couldn't load your tasks"**: the backend isn't running. Start it with `npm run dev`
  from this folder, or `npm run dev` inside `backend/`.
- **"Port 3000/4000 is already in use"**: another copy is still running. Close the other terminal,
  or change the port in the `.env` files.
- **`node:sqlite` not found** (when running `npm test`): your Node.js is too old.
  Install the current LTS version.

## Deploy to Vercel

The whole app deploys as **one Vercel project** using Vercel Services (beta, available on all
plans). [vercel.json](vercel.json) defines two services and sends traffic to them:

| Address                    | Goes to                         |
| -------------------------- | ------------------------------- |
| `/api/...`                 | `backend` (Fastify, `backend/`) |
| everything else            | `frontend` (Next.js, `frontend/`) |

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

If you change an environment variable later, open **Deployments** and **Redeploy**, because
changes only take effect after a new deployment.

To try the deployed setup on your computer, install the Vercel CLI and run `vercel dev`
in the repository root. It runs both services together, the same way as on Vercel.

> The app has no login yet, so everyone who opens the website shares one task list.
