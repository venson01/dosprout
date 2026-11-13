import type { Client, InStatement } from "@libsql/client";
import { GoalStore } from "./goal-store.js";
import { saveSettingsStatement, SettingsStore, withDefaults } from "./settings-store.js";
import { TaskStore, toUtcTimestamp } from "./task-store.js";
import { TimeStore } from "./time-store.js";
import type { Backup } from "./types.js";

/**
 * Backups of ONE team: its tasks, goals and your tracked time in it, plus your settings
 * (the Settings page downloads it as a file). Also restoring from one, and deleting all
 * of the team's data.
 */
export class BackupStore {
  constructor(
    private readonly db: Client,
    private readonly teamId: number,
    private readonly userId: number,
  ) {}

  /** Deletes the team's tasks, subtasks, goals and everyone's time in it. */
  private deleteAllStatements(): InStatement[] {
    return [
      "DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE team_id = ?)",
      "DELETE FROM time_entries WHERE team_id = ?",
      "DELETE FROM tasks WHERE team_id = ?",
      "DELETE FROM goals WHERE team_id = ?",
    ].map((sql) => ({ sql, args: [this.teamId] }));
  }

  async export(): Promise<Backup> {
    const [tasks, goals, timeEntries, settings] = await Promise.all([
      new TaskStore(this.db, this.teamId).list(),
      new GoalStore(this.db, this.teamId).list(),
      new TimeStore(this.db, this.teamId, this.userId).list(),
      new SettingsStore(this.db, this.userId).get(),
    ]);
    return { app: "DoSprout", version: 1, exportedAt: new Date().toISOString(), settings, goals, tasks, timeEntries };
  }

  /**
   * Replaces ALL of the team's data with the backup's. One batch = one transaction:
   * if anything fails, nothing changes.
   *
   * The rows get NEW ids: other teams share these tables, so the backup's ids may
   * already be taken. Each new id is "the highest id in use + its place in the file",
   * and links (task -> goal, entry -> task) are translated to the new ids.
   * `memberIds`: assignees who aren't in the team (any more) are dropped.
   */
  async import(backup: Backup, memberIds: Set<number>): Promise<void> {
    const utc = (value: string | null) => toUtcTimestamp(value);
    const [goalMax, taskMax, subtaskMax, entryMax] = await this.db.batch(
      ["goals", "tasks", "subtasks", "time_entries"].map((table) => `SELECT COALESCE(MAX(id), 0) AS id FROM ${table}`),
      "read",
    );
    const newIds = (oldIds: number[], max: number) => new Map(oldIds.map((id, index) => [id, max + index + 1]));
    const goalIds = newIds(backup.goals.map((g) => g.id), Number(goalMax.rows[0].id));
    const taskIds = newIds(backup.tasks.map((t) => t.id), Number(taskMax.rows[0].id));
    let nextSubtaskId = Number(subtaskMax.rows[0].id) + 1;
    const entryIds = newIds(backup.timeEntries.map((e) => e.id), Number(entryMax.rows[0].id));

    const statements: InStatement[] = [
      ...this.deleteAllStatements(),
      ...backup.goals.map((goal) => ({
        sql: `INSERT INTO goals (id, team_id, title, description, color, target_date, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          goalIds.get(goal.id)!,
          this.teamId,
          goal.title,
          goal.description,
          goal.color,
          goal.targetDate,
          utc(goal.createdAt),
          utc(goal.updatedAt),
        ],
      })),
      ...backup.tasks.map((task) => ({
        sql: `INSERT INTO tasks (id, team_id, title, description, status, priority, tag, start_at, due_at, position,
                created_at, updated_at, completed_at, goal_id, estimate_minutes, assignee_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          taskIds.get(task.id)!,
          this.teamId,
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
          task.goalId === null ? null : goalIds.get(task.goalId)!,
          task.estimateMinutes,
          // Older backups have no assigneeId.
          task.assigneeId && memberIds.has(task.assigneeId) ? task.assigneeId : null,
        ],
      })),
      ...backup.tasks.flatMap((task) =>
        task.subtasks.map((subtask) => ({
          sql: "INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)",
          args: [nextSubtaskId++, taskIds.get(task.id)!, subtask.title, subtask.done ? 1 : 0, subtask.position],
        })),
      ),
      // All tracked time in the file becomes yours.
      ...backup.timeEntries.map((entry) => ({
        sql: `INSERT INTO time_entries (id, team_id, user_id, task_id, kind, started_at, ended_at, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          entryIds.get(entry.id)!,
          this.teamId,
          this.userId,
          entry.taskId === null ? null : taskIds.get(entry.taskId)!,
          entry.kind,
          utc(entry.startedAt),
          utc(entry.endedAt),
          entry.note,
          utc(entry.createdAt),
        ],
      })),
      saveSettingsStatement(this.userId, withDefaults(backup.settings ?? null)),
    ];
    await this.db.batch(statements, "write");
  }

  /** Deletes the team's tasks, subtasks, goals and tracked time. Settings are kept. */
  async deleteAll(): Promise<void> {
    await this.db.batch(this.deleteAllStatements(), "write");
  }
}
