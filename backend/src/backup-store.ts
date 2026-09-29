import type { Client, InStatement } from "@libsql/client";
import { GoalStore } from "./goal-store.js";
import { saveSettingsStatement, SettingsStore, withDefaults } from "./settings-store.js";
import { TaskStore, toUtcTimestamp } from "./task-store.js";
import { TimeStore } from "./time-store.js";
import type { Backup } from "./types.js";

/** Deletes every task, subtask, goal and time entry (settings stay). */
const DELETE_ALL: InStatement[] = [
  "DELETE FROM subtasks",
  "DELETE FROM time_entries",
  "DELETE FROM tasks",
  "DELETE FROM goals",
];

/**
 * Backups: everything in one JSON object (the Settings page downloads it as a file),
 * restoring from one, and deleting all data.
 */
export class BackupStore {
  constructor(private readonly db: Client) {}

  async export(): Promise<Backup> {
    const [tasks, goals, timeEntries, settings] = await Promise.all([
      new TaskStore(this.db).list(),
      new GoalStore(this.db).list(),
      new TimeStore(this.db).list(),
      new SettingsStore(this.db).get(),
    ]);
    return { app: "DoSprout", version: 1, exportedAt: new Date().toISOString(), settings, goals, tasks, timeEntries };
  }

  /**
   * Replaces ALL data with the backup's (ids are kept, so links between tasks,
   * goals and time stay right). One batch = one transaction: if anything fails,
   * nothing changes.
   */
  async import(backup: Backup): Promise<void> {
    const utc = (value: string | null) => toUtcTimestamp(value);
    const statements: InStatement[] = [
      ...DELETE_ALL,
      ...backup.goals.map((goal) => ({
        sql: `INSERT INTO goals (id, title, description, color, target_date, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [goal.id, goal.title, goal.description, goal.color, goal.targetDate, utc(goal.createdAt), utc(goal.updatedAt)],
      })),
      ...backup.tasks.map((task) => ({
        sql: `INSERT INTO tasks (id, title, description, status, priority, tag, start_at, due_at, position,
                created_at, updated_at, completed_at, goal_id, estimate_minutes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          task.id,
          task.title,
          task.description,
          task.status,
          task.priority,
          task.tag,
          utc(task.startAt),
          utc(task.dueAt),
          task.position,
          utc(task.createdAt),
          utc(task.updatedAt),
          utc(task.completedAt),
          task.goalId,
          task.estimateMinutes,
        ],
      })),
      ...backup.tasks.flatMap((task) =>
        task.subtasks.map((subtask) => ({
          sql: "INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)",
          args: [subtask.id, task.id, subtask.title, subtask.done ? 1 : 0, subtask.position],
        })),
      ),
      ...backup.timeEntries.map((entry) => ({
        sql: `INSERT INTO time_entries (id, task_id, kind, started_at, ended_at, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [entry.id, entry.taskId, entry.kind, utc(entry.startedAt), utc(entry.endedAt), entry.note, utc(entry.createdAt)],
      })),
      saveSettingsStatement(withDefaults(backup.settings ?? null)),
    ];
    await this.db.batch(statements, "write");
  }

  /** Deletes every task, subtask, goal and time entry. Settings are kept. */
  async deleteAll(): Promise<void> {
    await this.db.batch(DELETE_ALL, "write");
  }
}
