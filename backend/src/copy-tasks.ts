import type { Client } from "@libsql/client";

// Every column, so the copy is exact (same ids, dates, order and completion times).
const TASK_COLUMNS = [
  "id",
  "title",
  "description",
  "status",
  "priority",
  "tag",
  "start_at",
  "due_at",
  "position",
  "created_at",
  "updated_at",
  "completed_at",
];
const SUBTASK_COLUMNS = ["id", "task_id", "title", "done", "position"];

/** Thrown when the target already has tasks and `replace` wasn't asked for. */
export class TargetNotEmptyError extends Error {
  constructor(readonly taskCount: number) {
    super(`The target database already has ${taskCount} task(s).`);
  }
}

function insertSql(table: string, columns: string[]) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
}

/**
 * Copies every task and subtask from one database to another, keeping their ids.
 * Both must already be set up by openDatabase(), so they have the same tables.
 * The target must have no tasks, unless `replace` is true: then its tasks are deleted first.
 * It all happens in one transaction, so if anything fails, the target is left unchanged.
 */
export async function copyTasks(from: Client, to: Client, { replace = false } = {}) {
  const [tasks, subtasks] = await from.batch(
    ["SELECT * FROM tasks ORDER BY id", "SELECT * FROM subtasks ORDER BY id"],
    "read",
  );

  const { rows } = await to.execute("SELECT COUNT(*) AS count FROM tasks");
  const existing = Number(rows[0].count);
  if (existing > 0 && !replace) throw new TargetNotEmptyError(existing);

  await to.batch(
    [
      "DELETE FROM subtasks",
      "DELETE FROM tasks",
      ...tasks.rows.map((row) => ({
        sql: insertSql("tasks", TASK_COLUMNS),
        args: TASK_COLUMNS.map((column) => row[column]),
      })),
      ...subtasks.rows.map((row) => ({
        sql: insertSql("subtasks", SUBTASK_COLUMNS),
        args: SUBTASK_COLUMNS.map((column) => row[column]),
      })),
    ],
    "write",
  );

  return { tasks: tasks.rows.length, subtasks: subtasks.rows.length };
}
