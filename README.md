# DoSprout

DoSprout is a simple todo app with a **Next.js + Tailwind CSS** frontend and a **Fastify** backend that saves
tasks in a **SQLite** database (a local file while developing, [Turso](https://turso.tech) when
deployed on Vercel). The design is based on [moodboard/inspo.png](moodboard/inspo.png).

Features:

- Tasks grouped into **To Do / In Progress / Done**
- **List view** and **Board view**. On the board you can drag cards between columns.
- Tags (Work, Health, ...) and priorities (High / Mid / Low)
- Start and due dates, each with a time. Overdue tasks turn red.
- **Subtasks** with a progress bar
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

Vercel can host both parts, as **two Vercel projects** made from this one repository.
Vercel can't keep a database file, so the deployed backend stores tasks in a free
[Turso](https://turso.tech) database instead (Turso is SQLite in the cloud).

Before you start, push this repository to GitHub.

**1. Create the database**

1. Sign up at [turso.tech](https://turso.tech) and create a database (for example `todos`).
2. Copy its **URL**. It looks like `libsql://todos-yourname.turso.io`.
3. Create a **token** for it and copy that too. Treat the token like a password.

**2. Deploy the backend**

1. On [vercel.com](https://vercel.com), click **Add New → Project** and import the repository.
2. Set **Root Directory** to `backend`. Vercel detects Fastify by itself.
3. Under **Environment Variables**, add:
   - `TURSO_DATABASE_URL` = the URL from step 1
   - `TURSO_AUTH_TOKEN` = the token from step 1
4. Click **Deploy**. When it's done, copy the address (e.g. `https://dosprout-api.vercel.app`)
   and open `<that address>/api/health`. You should see `{"ok":true}`.

The tables and example tasks are created automatically the first time the backend runs.

**3. Deploy the frontend**

1. Add another project from the **same** repository, with **Root Directory** set to `frontend`.
2. Add the environment variable `NEXT_PUBLIC_API_URL` = the backend address from step 2
   (no `/` at the end).
3. Click **Deploy** and copy the website's address (e.g. `https://dosprout.vercel.app`).

**4. Let the frontend talk to the backend**

In the **backend** project, go to **Settings → Environment Variables**, add
`CORS_ORIGIN` = the website address from step 3 (no `/` at the end), then open
**Deployments** and **Redeploy** the latest one. Environment variable changes only take
effect after a redeploy. The same goes for the frontend if you change `NEXT_PUBLIC_API_URL`.

Open the website. If it says "Couldn't load your tasks", double-check the three addresses above.

> The app has no login yet, so everyone who opens the website shares one task list.

