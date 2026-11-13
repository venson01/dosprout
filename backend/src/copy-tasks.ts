import type { Client, InStatement } from "@libsql/client";

// Every table with data, in an order where nothing points at a row that isn't copied yet.
// (The schema_version table isn't copied: openDatabase() already set it up in both.)
const TABLES = [
  "users",
  "sessions",
  "teams",
  "team_members",
  "invites",
  "settings",
  "user_settings",
  "goals",
  "tasks",
  "subtasks",
  "time_entries",
] as const;

/** Thrown when the target already has tasks and `replace` wasn't asked for. */
export class TargetNotEmptyError extends Error {
  constructor(readonly taskCount: number) {
    super(`The target database already has ${taskCount} task(s).`);
  }
}

/**
 * Copies everything (accounts, teams, tasks, subtasks, goals, time entries, settings)
 * from one database to another, row by row with every column, so ids, dates and order
 * stay exactly the same.
 * Both must already be set up by openDatabase(), so they have the same tables.
 * The target must have no tasks, unless `replace` is true: then its data is deleted first.
 * It all happens in one transaction, so if anything fails, the target is left unchanged.
 */
export async function copyTasks(from: Client, to: Client, { replace = false } = {}) {
  const results = await from.batch(
    TABLES.map((table) => `SELECT * FROM ${table}`),
    "read",
  );

  const { rows } = await to.execute("SELECT COUNT(*) AS count FROM tasks");
  const existing = Number(rows[0].count);
  if (existing > 0 && !replace) throw new TargetNotEmptyError(existing);

  const inserts: InStatement[] = TABLES.flatMap((table, index) => {
    const { columns, rows: tableRows } = results[index];
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    return tableRows.map((row) => ({ sql, args: columns.map((column) => row[column]) }));
  });
  await to.batch([...TABLES.map((table) => `DELETE FROM ${table}`), ...inserts], "write");

  // How many rows of each kind were copied, e.g. { tasks: 6, goals: 1, ... }.
  const count = (table: (typeof TABLES)[number]) => results[TABLES.indexOf(table)].rows.length;
  return {
    users: count("users"),
    teams: count("teams"),
    tasks: count("tasks"),
    subtasks: count("subtasks"),
    goals: count("goals"),
    timeEntries: count("time_entries"),
  };
}
