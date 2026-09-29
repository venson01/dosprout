import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Client, InStatement } from "@libsql/client";

// Each entry upgrades the database by one version. The database remembers its
// current version in the schema_version table, so every migration runs only once.
// To change the schema later, ADD a new entry to the end — never edit old ones.
// Separate statements with ";" (and don't use ";" inside text values).
const MIGRATIONS: string[] = [
  // Version 1: tasks and their subtasks.
  `
  CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'in_progress', 'done')),
    priority    TEXT    NOT NULL DEFAULT 'mid'
                CHECK (priority IN ('low', 'mid', 'high')),
    tag         TEXT    NOT NULL DEFAULT '',
    due_date    TEXT,
    position    REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE subtasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title    TEXT    NOT NULL,
    done     INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX subtasks_task_id ON subtasks(task_id);
  `,

  // Version 2: dates get a time. due_date ("2026-11-17") becomes due_at, a UTC
  // timestamp; old due dates are set to 5:00 PM in this computer's timezone.
  `
  ALTER TABLE tasks ADD COLUMN start_at TEXT;
  ALTER TABLE tasks ADD COLUMN due_at TEXT;
  UPDATE tasks
    SET due_at = strftime('%Y-%m-%dT%H:%M:%fZ', due_date || ' 17:00', 'utc')
    WHERE due_date IS NOT NULL;
  ALTER TABLE tasks DROP COLUMN due_date;
  `,

  // Version 3: remember when a task was completed (for "task done" notifications).
  // Tasks that are already done get their last update time as a best guess.
  `
  ALTER TABLE tasks ADD COLUMN completed_at TEXT;
  UPDATE tasks SET completed_at = updated_at WHERE status = 'done';
  `,

  // Version 4: goals. A task can belong to one goal (tasks.goal_id).
  // Deleting a goal unlinks its tasks (see GoalStore.delete).
  `
  CREATE TABLE goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    color       TEXT    NOT NULL DEFAULT 'blue',
    target_date TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  ALTER TABLE tasks ADD COLUMN goal_id INTEGER;
  `,
];

export interface OpenDatabaseOptions {
  /**
   * Where the database is:
   * - "file:data/todos.db"   a file on this computer (the default for local development)
   * - "libsql://....turso.io" a Turso database in the cloud (used on Vercel)
   * - ":memory:"             a throwaway database (used by tests)
   */
  url: string;
  /** Password-like token for a Turso cloud database. Not needed for files or ":memory:". */
  authToken?: string;
  /** Add a few example tasks when the database is brand new. */
  seed?: boolean;
}

export async function openDatabase({ url, authToken, seed = false }: OpenDatabaseOptions) {
  const db = await connect(url, authToken);

  const startVersion = await schemaVersion(db);
  const statements: InStatement[] = [];
  for (let version = startVersion; version < MIGRATIONS.length; version++) {
    statements.push(...splitStatements(MIGRATIONS[version]));
  }
  if (statements.length > 0) {
    statements.push({
      sql: "UPDATE schema_version SET version = ?",
      args: [MIGRATIONS.length],
    });
  }
  if (startVersion === 0 && seed) {
    statements.push(...exampleTaskStatements());
  }
  // batch() runs everything in one transaction: either it all works, or nothing changes.
  if (statements.length > 0) {
    await db.batch(statements, "write");
  }

  return db;
}

/**
 * Connects to the database, loading only the code that kind of database needs:
 * - A cloud database (Turso, "libsql://...") is reached over HTTPS by the
 *   pure-JavaScript "web" client.
 * - A local file or ":memory:" needs the native SQLite library.
 * This matters on Vercel: its bundler can't include the native library (the
 * library picks its file by name only at runtime), so loading it there would
 * crash the backend on every request.
 */
async function connect(url: string, authToken?: string): Promise<Client> {
  if (/^(libsql|https?|wss?):/.test(url)) {
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url, authToken });
  }
  // A local database file can only be created if its folder exists.
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const { createClient } = await import("@libsql/client");
  return createClient({ url, authToken });
}

/**
 * Returns how many MIGRATIONS this database has already run.
 * It is stored in a one-row table called schema_version.
 */
async function schemaVersion(db: Client): Promise<number> {
  await db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const { rows } = await db.execute("SELECT version FROM schema_version");
  if (rows.length > 0) return Number(rows[0].version);

  // Databases made by older versions of this app kept the number in
  // PRAGMA user_version instead, so start from there.
  const legacy = await db.execute("PRAGMA user_version").catch(() => undefined);
  const version = Number(legacy?.rows[0]?.user_version ?? 0);
  await db.execute({ sql: "INSERT INTO schema_version (version) VALUES (?)", args: [version] });
  return version;
}

/** Turns one migration string into separate statements (they are split on ";"). */
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** A UTC timestamp for a local time a number of days from today, e.g. (2, 17) = 5 PM the day after tomorrow. */
function daysFromToday(days: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/** A local day a number of days from today, as "2026-10-13" (for goal target dates). */
function dayFromToday(days: number): string {
  return daysFromToday(days, 12).slice(0, 10);
}

// Example data so the app doesn't look empty the first time you open it.
// The database is brand new here, so we can choose the ids ourselves.
function exampleTaskStatements(): InStatement[] {
  // One example goal; the three work tasks belong to it (goal: 1).
  const goal: InStatement = {
    sql: "INSERT INTO goals (id, title, description, color, target_date) VALUES (?, ?, ?, ?, ?)",
    args: [
      1,
      "Launch the new website",
      "Everything needed before the site goes live.",
      "blue",
      dayFromToday(14),
    ],
  };
  const examples = [
    { title: "Website Development", status: "todo", priority: "high", tag: "Work", start: 1, due: 2, goal: 1,
      subtasks: [["Wireframes", 0], ["Build landing page", 0], ["Connect API", 0], ["Deploy", 0]] },
    { title: "Update Contact Form", status: "todo", priority: "mid", tag: "Work", start: 2, due: 3, goal: 1,
      subtasks: [["Add phone field", 0], ["Validate email", 0]] },
    { title: "Do back exercises", status: "in_progress", priority: "mid", tag: "Health", start: 0, due: 2, goal: null,
      subtasks: [["Stretch", 1], ["Plank", 1], ["Bridges", 0]] },
    { title: "Integrate Payment Gateway", status: "in_progress", priority: "low", tag: "Work", start: -1, due: 2, goal: 1,
      subtasks: [["Create sandbox account", 1], ["Checkout page", 1], ["Webhooks", 0]] },
    { title: "Visit a dermatologist", status: "done", priority: "high", tag: "Health", start: -2, due: -1, goal: null,
      subtasks: [["Book appointment", 1]] },
  ] as const;

  return [goal, ...examples.flatMap((example, index) => {
    const taskId = index + 1;
    return [
      {
        sql: `INSERT INTO tasks (id, title, status, priority, tag, start_at, due_at, position, completed_at, goal_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          taskId,
          example.title,
          example.status,
          example.priority,
          example.tag,
          daysFromToday(example.start, 9),
          daysFromToday(example.due, 17),
          index,
          // Finished examples were "completed" at noon on their due day.
          example.status === "done" ? daysFromToday(example.due, 12) : null,
          example.goal,
        ],
      },
      ...example.subtasks.map(([title, done], position) => ({
        sql: "INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)",
        args: [taskId, title, done, position],
      })),
    ];
  })];
}
