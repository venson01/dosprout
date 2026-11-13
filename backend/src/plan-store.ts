import type { Client } from "@libsql/client";
import type { EstimateSample, PlanEntry } from "./types.js";

/** How far back estimate accuracy looks: recent habits matter more than old ones. */
export const ESTIMATE_HISTORY_DAYS = 180;
/** At most this many finished tasks are used (the most recent ones). */
const MAX_SAMPLES = 200;

// Tasks "on your plate", the same rule as My work: everything in your personal team, plus
// the tasks assigned to you in your other teams (and only teams you're still in).
const ON_MY_PLATE = `
  JOIN team_members ON team_members.team_id = tasks.team_id AND team_members.user_id = ?
  JOIN teams ON teams.id = tasks.team_id`;
const MINE = "(teams.personal = 1 OR tasks.assignee_id = ?)";

interface PlanRow {
  task_id: number;
  team_id: number;
  day: string;
}

interface SampleRow {
  task_id: number;
  tag: string;
  estimate_minutes: number;
  completed_at: string;
  tracked_minutes: number;
}

/**
 * One person's day plans ("Plan my day") and the history their estimates are compared
 * with. Like My work, this spans all their teams, so it takes a user id, not a team id.
 */
export class PlanStore {
  constructor(
    private readonly db: Client,
    private readonly userId: number,
  ) {}

  /** Every task this person has planned for a day (in teams they're still in). */
  async entries(): Promise<PlanEntry[]> {
    const { rows } = await this.db.execute({
      sql: `SELECT day_plans.task_id, tasks.team_id, day_plans.day
            FROM day_plans
            JOIN tasks ON tasks.id = day_plans.task_id
            JOIN team_members ON team_members.team_id = tasks.team_id AND team_members.user_id = day_plans.user_id
            WHERE day_plans.user_id = ?
            ORDER BY day_plans.day, day_plans.created_at, day_plans.task_id`,
      args: [this.userId],
    });
    return (rows as unknown as PlanRow[]).map((row) => ({ taskId: row.task_id, teamId: row.team_id, day: row.day }));
  }

  /**
   * Plans a task for a day ("2026-11-13", the person's own local day), or moves it to
   * another day. Returns undefined if the task isn't in one of their teams.
   */
  async plan(taskId: number, day: string): Promise<PlanEntry | undefined> {
    const { rows } = await this.db.execute({
      sql: `SELECT tasks.team_id FROM tasks
            JOIN team_members ON team_members.team_id = tasks.team_id AND team_members.user_id = ?
            WHERE tasks.id = ?`,
      args: [this.userId, taskId],
    });
    if (rows.length === 0) return undefined;
    // A task is planned for one day at most: planning it again moves it (and to the end of
    // that day's list, as a new created_at).
    await this.db.execute({
      sql: `INSERT INTO day_plans (user_id, task_id, day) VALUES (?, ?, ?)
            ON CONFLICT (user_id, task_id)
            DO UPDATE SET day = excluded.day, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      args: [this.userId, taskId, day],
    });
    return { taskId, teamId: Number(rows[0].team_id), day };
  }

  /** Takes a task out of the plan. */
  async unplan(taskId: number): Promise<void> {
    await this.db.execute({
      sql: "DELETE FROM day_plans WHERE user_id = ? AND task_id = ?",
      args: [this.userId, taskId],
    });
  }

  /**
   * What estimate accuracy is learned from: this person's finished tasks that had an
   * estimate and that they tracked time on, with their own tracked minutes (time other
   * people tracked doesn't count). Most recent first.
   */
  async estimateSamples(): Promise<EstimateSample[]> {
    const since = new Date(Date.now() - ESTIMATE_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { rows } = await this.db.execute({
      sql: `SELECT tasks.id AS task_id, tasks.tag, tasks.estimate_minutes, tasks.completed_at,
                   -- julianday() counts in days; * 1440 turns that into minutes.
                   SUM((julianday(time_entries.ended_at) - julianday(time_entries.started_at)) * 1440) AS tracked_minutes
            FROM tasks
            ${ON_MY_PLATE}
            JOIN time_entries ON time_entries.task_id = tasks.id
                             AND time_entries.user_id = ?
                             AND time_entries.ended_at IS NOT NULL
            WHERE ${MINE}
              AND tasks.status = 'done'
              AND tasks.estimate_minutes IS NOT NULL
              AND tasks.completed_at >= ?
            GROUP BY tasks.id
            HAVING tracked_minutes >= 1
            ORDER BY tasks.completed_at DESC
            LIMIT ${MAX_SAMPLES}`,
      args: [this.userId, this.userId, this.userId, since],
    });
    return (rows as unknown as SampleRow[]).map((row) => ({
      taskId: row.task_id,
      tag: row.tag,
      estimateMinutes: Number(row.estimate_minutes),
      trackedMinutes: Math.round(Number(row.tracked_minutes)),
      completedAt: row.completed_at,
    }));
  }
}
