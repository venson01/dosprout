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

  // Version 5: time tracking. Each row is a stretch of time spent (on a task or not);
  // ended_at is empty while a timer runs. Tasks can have an estimate in minutes.
  `
  CREATE TABLE time_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER,
    kind       TEXT    NOT NULL DEFAULT 'timer',
    started_at TEXT    NOT NULL,
    ended_at   TEXT,
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX time_entries_task_id ON time_entries(task_id);
  ALTER TABLE tasks ADD COLUMN estimate_minutes INTEGER;
  `,

  // Version 6: settings, stored as one JSON object in a one-row table (see SettingsStore).
  `
  CREATE TABLE settings (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT    NOT NULL
  );
  `,

  // Version 7: accounts and teams.
  // - users log in with an email and password; sessions remember who is logged in
  //   (only a hash of each login token is stored, so a stolen database can't log anyone in).
  // - every user has a "personal" team of one, plus any teams they create or are invited to.
  // - tasks, goals and time entries belong to a team (team_id); time entries also to a user.
  // - tasks can be assigned to a team member (assignee_id).
  // - settings become per user (user_settings). The old shared settings row and all
  //   existing data are taken over by the first person who signs up (see AccountStore).
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);
  CREATE TABLE teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    personal   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE team_members (
    team_id   INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (team_id, user_id)
  );
  CREATE INDEX team_members_user_id ON team_members(user_id);
  CREATE TABLE invites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id    INTEGER NOT NULL,
    email      TEXT    NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT    NOT NULL
  );
  CREATE INDEX invites_team_id ON invites(team_id);
  CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY,
    data    TEXT    NOT NULL
  );
  ALTER TABLE tasks ADD COLUMN team_id INTEGER;
  ALTER TABLE tasks ADD COLUMN assignee_id INTEGER;
  ALTER TABLE goals ADD COLUMN team_id INTEGER;
  ALTER TABLE time_entries ADD COLUMN team_id INTEGER;
  ALTER TABLE time_entries ADD COLUMN user_id INTEGER;
  CREATE INDEX tasks_team_id ON tasks(team_id);
  CREATE INDEX goals_team_id ON goals(team_id);
  CREATE INDEX time_entries_team_id ON time_entries(team_id);
  CREATE INDEX time_entries_user_id ON time_entries(user_id);
  `,

  // Version 8: organizations. An organization groups teams (teams.organization_id, or NULL
  // for a team on its own). Its members are "admin" or "member"; admins invite people with
  // organization_invites links and can manage every team in it.
  `
  CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE organization_members (
    organization_id INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (organization_id, user_id)
  );
  CREATE INDEX organization_members_user_id ON organization_members(user_id);
  CREATE TABLE organization_invites (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    email           TEXT    NOT NULL,
    token           TEXT    NOT NULL UNIQUE,
    invited_by      INTEGER NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at      TEXT    NOT NULL
  );
  CREATE INDEX organization_invites_organization_id ON organization_invites(organization_id);
  ALTER TABLE teams ADD COLUMN organization_id INTEGER;
  CREATE INDEX teams_organization_id ON teams(organization_id);
  `,

  // Version 9: profile pictures. The picture itself is in its own table, so the many
  // queries that read users don't load it. users.avatar_updated_at says whether someone
  // has one (NULL = no) and changes with every upload, so browsers fetch the new one.
  `
  CREATE TABLE avatars (
    user_id      INTEGER PRIMARY KEY,
    content_type TEXT    NOT NULL,
    data         TEXT    NOT NULL
  );
  ALTER TABLE users ADD COLUMN avatar_updated_at TEXT;
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
}

/**
 * Connects to the database and brings its tables up to date (runs the MIGRATIONS it
 * hasn't run yet). Example tasks are added per new account, not here (see example-data.ts).
 */
export async function openDatabase({ url, authToken }: OpenDatabaseOptions) {
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
