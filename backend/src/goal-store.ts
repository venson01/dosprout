import type { Client, InValue } from "@libsql/client";
import { NOW } from "./task-store.js";
import type { CreateGoalInput, Goal, GoalColor, UpdateGoalInput } from "./types.js";

// A row exactly as SQLite returns it (snake_case columns).
interface GoalRow {
  id: number;
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

/**
 * All database reads and writes for goals. A goal's progress isn't stored:
 * it's worked out from its tasks (tasks.goal_id) wherever it's shown.
 */
export class GoalStore {
  constructor(private readonly db: Client) {}

  /** All goals, oldest first. */
  async list(): Promise<Goal[]> {
    const { rows } = await this.db.execute("SELECT * FROM goals ORDER BY id");
    return (rows as unknown as GoalRow[]).map(toGoal);
  }

  async get(id: number): Promise<Goal | undefined> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM goals WHERE id = ?", args: [id] });
    const row = rows[0] as unknown as GoalRow | undefined;
    return row && toGoal(row);
  }

  async create(input: CreateGoalInput): Promise<Goal> {
    const result = await this.db.execute({
      sql: "INSERT INTO goals (title, description, color, target_date) VALUES (?, ?, ?, ?)",
      args: [
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
        sql: `UPDATE goals SET ${assignments.join(", ")}, updated_at = ${NOW} WHERE id = ?`,
        args: [...args, id],
      });
    }
    return this.get(id);
  }

  /** Returns false if no goal had this id. Its tasks are kept, just no longer linked to it. */
  async delete(id: number): Promise<boolean> {
    // Both in one batch (a transaction), so tasks never point at a deleted goal.
    const [, goalResult] = await this.db.batch(
      [
        { sql: "UPDATE tasks SET goal_id = NULL WHERE goal_id = ?", args: [id] },
        { sql: "DELETE FROM goals WHERE id = ?", args: [id] },
      ],
      "write",
    );
    return goalResult.rowsAffected > 0;
  }
}
