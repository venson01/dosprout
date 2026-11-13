import type { Client, InValue } from "@libsql/client";
import type {
  CreateSubtaskInput,
  CreateTaskInput,
  Subtask,
  Task,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from "./types.js";

// Rows exactly as SQLite returns them (snake_case columns, 0/1 for booleans).
interface TaskRow {
  id: number;
  team_id: number;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  tag: string;
  start_at: string | null;
  due_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  goal_id: number | null;
  estimate_minutes: number | null;
  assignee_id: number | null;
}

interface SubtaskRow {
  id: number;
  task_id: number;
  title: string;
  done: number;
  position: number;
}

function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    done: row.done === 1,
    position: row.position,
  };
}

function toTask(row: TaskRow, subtasks: Subtask[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    tag: row.tag,
    startAt: row.start_at,
    dueAt: row.due_at,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    goalId: row.goal_id,
    estimateMinutes: row.estimate_minutes,
    assigneeId: row.assignee_id,
    subtasks,
  };
}

/**
 * Timestamps can arrive in any valid ISO form ("2026-11-17T18:00:00+01:00").
 * Storing them all in the same UTC form lets SQLite and JavaScript compare
 * and sort them as plain text.
 */
export function toUtcTimestamp(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/**
 * Works out a task's status from its subtasks:
 * - every subtask done           -> "done"
 * - at least one subtask done    -> "in_progress"
 * - none done, but task was done -> "todo" (it isn't finished any more)
 * Otherwise (or when there are no subtasks) the status stays as it is.
 * frontend/src/lib/task-helpers.ts has a copy of this, keep them the same.
 */
export function statusFromSubtasks(status: Task["status"], subtasks: Subtask[]): Task["status"] {
  if (subtasks.length === 0) return status;
  const finished = subtasks.filter((s) => s.done).length;
  if (finished === subtasks.length) return "done";
  if (finished > 0) return "in_progress";
  return status === "done" ? "todo" : status;
}

/**
 * A task can't be "done" while some of its subtasks aren't.
 * frontend/src/lib/task-helpers.ts has a copy of this, keep them the same.
 */
export function hasUnfinishedSubtasks(task: Pick<Task, "subtasks">): boolean {
  return task.subtasks.some((subtask) => !subtask.done);
}

// SQL snippets used in several queries below.
// The current time as a UTC timestamp, e.g. "2026-11-17T16:00:00.000Z".
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
// The bottom of a status column in a team. Needs the status and the team id as its "?" arguments.
const NEXT_TASK_POSITION = "(SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE status = ? AND team_id = ?)";

// Maps API field names to database column names for fields that can be updated.
const UPDATABLE_TASK_COLUMNS = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  tag: "tag",
  startAt: "start_at",
  dueAt: "due_at",
  goalId: "goal_id",
  estimateMinutes: "estimate_minutes",
  assigneeId: "assignee_id",
  position: "position",
} as const satisfies Record<keyof UpdateTaskInput, string>;

/**
 * "My work": the tasks on one person's plate in ALL their teams. That's everything in
 * their personal team, plus the tasks assigned to them in their other teams.
 * Returns them grouped by team id. (Only teams they're still in count.)
 */
export async function tasksForPerson(db: Client, userId: number): Promise<Map<number, Task[]>> {
  const mine = `
    SELECT tasks.id FROM tasks
    JOIN team_members ON team_members.team_id = tasks.team_id AND team_members.user_id = ?
    JOIN teams ON teams.id = tasks.team_id
    WHERE teams.personal = 1 OR tasks.assignee_id = ?`;
  const [taskResult, subtaskResult] = await db.batch(
    [
      { sql: `SELECT * FROM tasks WHERE id IN (${mine}) ORDER BY position, id`, args: [userId, userId] },
      { sql: `SELECT * FROM subtasks WHERE task_id IN (${mine}) ORDER BY position, id`, args: [userId, userId] },
    ],
    "read",
  );

  const subtasksByTask = new Map<number, Subtask[]>();
  for (const row of subtaskResult.rows as unknown as SubtaskRow[]) {
    const list = subtasksByTask.get(row.task_id) ?? [];
    list.push(toSubtask(row));
    subtasksByTask.set(row.task_id, list);
  }
  const byTeam = new Map<number, Task[]>();
  for (const row of taskResult.rows as unknown as TaskRow[]) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(toTask(row, subtasksByTask.get(row.id) ?? []));
    byTeam.set(row.team_id, list);
  }
  return byTeam;
}

/**
 * All database reads and writes for tasks live here, so routes stay small.
 * Every method is async because the database may be in the cloud (Turso),
 * so each query has to wait for an answer.
 *
 * A TaskStore only sees ONE team's tasks (the teamId it was made with): every query
 * includes "team_id = ?". Routes make a new one for each request, for the team the
 * request is about, so nobody can read or change another team's tasks.
 */
export class TaskStore {
  constructor(
    private readonly db: Client,
    private readonly teamId: number,
  ) {}

  async list(): Promise<Task[]> {
    const [taskResult, subtaskResult] = await this.db.batch(
      [
        { sql: "SELECT * FROM tasks WHERE team_id = ? ORDER BY position, id", args: [this.teamId] },
        {
          sql: `SELECT * FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE team_id = ?)
                ORDER BY position, id`,
          args: [this.teamId],
        },
      ],
      "read",
    );
    const rows = taskResult.rows as unknown as TaskRow[];
    const subtaskRows = subtaskResult.rows as unknown as SubtaskRow[];

    const subtasksByTask = new Map<number, Subtask[]>();
    for (const row of subtaskRows) {
      const list = subtasksByTask.get(row.task_id) ?? [];
      list.push(toSubtask(row));
      subtasksByTask.set(row.task_id, list);
    }
    return rows.map((row) => toTask(row, subtasksByTask.get(row.id) ?? []));
  }

  async get(id: number): Promise<Task | undefined> {
    const [taskResult, subtaskResult] = await this.db.batch(
      [
        { sql: "SELECT * FROM tasks WHERE id = ? AND team_id = ?", args: [id, this.teamId] },
        { sql: "SELECT * FROM subtasks WHERE task_id = ? ORDER BY position, id", args: [id] },
      ],
      "read",
    );
    const row = taskResult.rows[0] as unknown as TaskRow | undefined;
    if (!row) return undefined;
    const subtaskRows = subtaskResult.rows as unknown as SubtaskRow[];
    return toTask(row, subtaskRows.map(toSubtask));
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const status = input.status ?? "todo";
    // Both inserts run in one batch (one transaction), so a task is never
    // saved without its subtasks. The subtasks can't know the new task's id
    // in advance, so they look it up: inside the transaction it's the highest id.
    const [taskResult] = await this.db.batch(
      [
        {
          sql: `INSERT INTO tasks (team_id, title, description, status, priority, tag, start_at, due_at, goal_id,
                  estimate_minutes, assignee_id, position, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NEXT_TASK_POSITION}, ${status === "done" ? NOW : "NULL"})`,
          args: [
            this.teamId,
            input.title.trim(),
            input.description?.trim() ?? "",
            status,
            input.priority ?? "mid",
            input.tag?.trim() ?? "",
            toUtcTimestamp(input.startAt ?? null),
            toUtcTimestamp(input.dueAt ?? null),
            input.goalId ?? null,
            input.estimateMinutes ?? null,
            input.assigneeId ?? null,
            status,
            this.teamId,
          ],
        },
        ...(input.subtasks ?? []).map((title, position) => ({
          sql: `INSERT INTO subtasks (task_id, title, position)
                VALUES ((SELECT MAX(id) FROM tasks), ?, ?)`,
          args: [title.trim(), position],
        })),
      ],
      "write",
    );
    return (await this.get(Number(taskResult.lastInsertRowid)))!;
  }

  /** Returns the updated task, or undefined if no task has this id. */
  async update(id: number, input: UpdateTaskInput): Promise<Task | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const assignments: string[] = [];
    const args: InValue[] = [];
    for (const [field, column] of Object.entries(UPDATABLE_TASK_COLUMNS)) {
      const value = input[field as keyof UpdateTaskInput];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      if (field === "startAt" || field === "dueAt") {
        args.push(toUtcTimestamp(value as string | null));
      } else {
        args.push(typeof value === "string" ? value.trim() : value);
      }
    }
    if (input.status && input.status !== existing.status) {
      // Moving a task to another column without a position puts it at the bottom.
      if (input.position === undefined) {
        assignments.push(`position = ${NEXT_TASK_POSITION}`);
        args.push(input.status, this.teamId);
      }
      // Remember when it was finished; forget it again if it's reopened.
      assignments.push(`completed_at = ${input.status === "done" ? NOW : "NULL"}`);
    }

    if (assignments.length > 0) {
      await this.db.execute({
        sql: `UPDATE tasks
              SET ${assignments.join(", ")}, updated_at = ${NOW}
              WHERE id = ? AND team_id = ?`,
        args: [...args, id, this.teamId],
      });
    }
    return this.get(id);
  }

  /** Returns false if no task had this id. Its subtasks and tracked time are deleted too. */
  async delete(id: number): Promise<boolean> {
    // Delete the subtasks ourselves rather than relying on ON DELETE CASCADE,
    // because that only works when SQLite's foreign key checks are switched on.
    // The "IN (SELECT ...)" parts make sure the task really is in this team.
    const thisTeamsTask = "(SELECT id FROM tasks WHERE id = ? AND team_id = ?)";
    const [, , , taskResult] = await this.db.batch(
      [
        { sql: `DELETE FROM subtasks WHERE task_id IN ${thisTeamsTask}`, args: [id, this.teamId] },
        { sql: `DELETE FROM day_plans WHERE task_id IN ${thisTeamsTask}`, args: [id, this.teamId] },
        { sql: `DELETE FROM time_entries WHERE task_id IN ${thisTeamsTask}`, args: [id, this.teamId] },
        { sql: "DELETE FROM tasks WHERE id = ? AND team_id = ?", args: [id, this.teamId] },
      ],
      "write",
    );
    return taskResult.rowsAffected > 0;
  }

  /** Returns the parent task with the new subtask, or undefined if the task doesn't exist. */
  async addSubtask(taskId: number, input: CreateSubtaskInput): Promise<Task | undefined> {
    if (!(await this.get(taskId))) return undefined;
    await this.db.execute({
      sql: `INSERT INTO subtasks (task_id, title, position)
            VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM subtasks WHERE task_id = ?))`,
      args: [taskId, input.title.trim(), taskId],
    });
    return this.syncStatusWithSubtasks(taskId);
  }

  /** Returns the parent task, or undefined if the task or subtask doesn't exist. */
  async updateSubtask(
    taskId: number,
    subtaskId: number,
    input: UpdateSubtaskInput,
  ): Promise<Task | undefined> {
    const { rowsAffected } = await this.db.execute({
      sql: `UPDATE subtasks
            SET title = COALESCE(?, title), done = COALESCE(?, done)
            WHERE id = ? AND task_id = ? AND task_id IN (SELECT id FROM tasks WHERE team_id = ?)`,
      args: [
        input.title?.trim() ?? null,
        input.done === undefined ? null : Number(input.done),
        subtaskId,
        taskId,
        this.teamId,
      ],
    });
    if (rowsAffected === 0) return undefined;
    return this.syncStatusWithSubtasks(taskId);
  }

  /** Returns the parent task, or undefined if the task or subtask doesn't exist. */
  async deleteSubtask(taskId: number, subtaskId: number): Promise<Task | undefined> {
    const { rowsAffected } = await this.db.execute({
      sql: `DELETE FROM subtasks
            WHERE id = ? AND task_id = ? AND task_id IN (SELECT id FROM tasks WHERE team_id = ?)`,
      args: [subtaskId, taskId, this.teamId],
    });
    if (rowsAffected === 0) return undefined;
    return this.syncStatusWithSubtasks(taskId);
  }

  /**
   * Called after any subtask change: moves the task to the status its subtasks
   * call for (see statusFromSubtasks) and marks it as updated.
   */
  private async syncStatusWithSubtasks(taskId: number): Promise<Task | undefined> {
    const task = (await this.get(taskId))!;
    const status = statusFromSubtasks(task.status, task.subtasks);
    if (status !== task.status) return this.update(taskId, { status });
    await this.db.execute({
      sql: `UPDATE tasks SET updated_at = ${NOW} WHERE id = ? AND team_id = ?`,
      args: [taskId, this.teamId],
    });
    return this.get(taskId);
  }
}
