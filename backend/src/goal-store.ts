import type { Client, InValue } from "@libsql/client";
import { NOW } from "./task-store.js";
import type { CreateGoalInput, Goal, GoalColor, UpdateGoalInput } from "./types.js";

// A row exactly as SQLite returns it (snake_case columns).
interface GoalRow {
  id: number;
  team_id: number;
  title: string;
  description: string;
  color: GoalColor;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color,
    targetDate: row.target_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Maps API field names to database column names for fields that can be updated.
const UPDATABLE_GOAL_COLUMNS = {
  title: "title",
  description: "description",
  color: "color",
  targetDate: "target_date",
} as const satisfies Record<keyof UpdateGoalInput, string>;

/** The goals in every team a person is in, grouped by team id (for "My work"). */
export async function goalsForPerson(db: Client, userId: number): Promise<Map<number, Goal[]>> {
  const { rows } = await db.execute({
    sql: `SELECT goals.* FROM goals
          JOIN team_members ON team_members.team_id = goals.team_id AND team_members.user_id = ?
          ORDER BY goals.id`,
    args: [userId],
  });
  const byTeam = new Map<number, Goal[]>();
  for (const row of rows as unknown as GoalRow[]) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(toGoal(row));
    byTeam.set(row.team_id, list);
  }
  return byTeam;
}

/**
 * All database reads and writes for goals. A goal's progress isn't stored:
 * it's worked out from its tasks (tasks.goal_id) wherever it's shown.
 * Like TaskStore, a GoalStore only sees one team's goals.
 */
export class GoalStore {
  constructor(
    private readonly db: Client,
    private readonly teamId: number,
  ) {}

  /** All of the team's goals, oldest first. */
  async list(): Promise<Goal[]> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM goals WHERE team_id = ? ORDER BY id",
      args: [this.teamId],
    });
    return (rows as unknown as GoalRow[]).map(toGoal);
  }

  async get(id: number): Promise<Goal | undefined> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM goals WHERE id = ? AND team_id = ?",
      args: [id, this.teamId],
    });
    const row = rows[0] as unknown as GoalRow | undefined;
    return row && toGoal(row);
  }

  async create(input: CreateGoalInput): Promise<Goal> {
    const result = await this.db.execute({
      sql: "INSERT INTO goals (team_id, title, description, color, target_date) VALUES (?, ?, ?, ?, ?)",
      args: [
        this.teamId,
        input.title.trim(),
        input.description?.trim() ?? "",
        input.color ?? "blue",
        input.targetDate ?? null,
      ],
    });
    return (await this.get(Number(result.lastInsertRowid)))!;
  }

  /** Returns the updated goal, or undefined if no goal has this id. */
  async update(id: number, input: UpdateGoalInput): Promise<Goal | undefined> {
    const assignments: string[] = [];
    const args: InValue[] = [];
    for (const [field, column] of Object.entries(UPDATABLE_GOAL_COLUMNS)) {
      const value = input[field as keyof UpdateGoalInput];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      args.push(typeof value === "string" ? value.trim() : value);
    }
    if (assignments.length > 0) {
      await this.db.execute({
        sql: `UPDATE goals SET ${assignments.join(", ")}, updated_at = ${NOW} WHERE id = ? AND team_id = ?`,
        args: [...args, id, this.teamId],
      });
    }
    return this.get(id);
  }

  /** Returns false if no goal had this id. Its tasks are kept, just no longer linked to it. */
  async delete(id: number): Promise<boolean> {
    // Both in one batch (a transaction), so tasks never point at a deleted goal.
    const [, goalResult] = await this.db.batch(
      [
        { sql: "UPDATE tasks SET goal_id = NULL WHERE goal_id = ? AND team_id = ?", args: [id, this.teamId] },
        { sql: "DELETE FROM goals WHERE id = ? AND team_id = ?", args: [id, this.teamId] },
      ],
      "write",
    );
    return goalResult.rowsAffected > 0;
  }
}
