import type { Client, InStatement, InValue } from "@libsql/client";
import { NOW, toUtcTimestamp } from "./task-store.js";
import type {
  CreateTimeEntryInput,
  StartTimerInput,
  TimeEntry,
  TimeEntryKind,
  UpdateTimeEntryInput,
} from "./types.js";

// A row exactly as SQLite returns it (snake_case columns).
interface TimeEntryRow {
  id: number;
  task_id: number | null;
  kind: TimeEntryKind;
  started_at: string;
  ended_at: string | null;
  note: string;
  created_at: string;
}

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

// Maps API field names to database column names for fields that can be updated.
const UPDATABLE_COLUMNS = {
  taskId: "task_id",
  startedAt: "started_at",
  endedAt: "ended_at",
  note: "note",
} as const satisfies Record<keyof UpdateTimeEntryInput, string>;

/**
 * All database reads and writes for tracked time. A time entry is a stretch of
 * time spent (on a task, or on nothing in particular). While a timer runs, its
 * entry has no end yet (ended_at IS NULL).
 *
 * Tracked time is personal: a TimeStore sees only ONE person's entries in ONE team.
 * Each person has at most one running timer (across all their teams).
 */
export class TimeStore {
  constructor(
    private readonly db: Client,
    private readonly teamId: number,
    private readonly userId: number,
  ) {}

  // Stops this person's running timer, in whichever team it runs.
  private stopRunning(): InStatement {
    return {
      sql: `UPDATE time_entries SET ended_at = ${NOW} WHERE ended_at IS NULL AND user_id = ?`,
      args: [this.userId],
    };
  }

  /** This person's entries in this team, newest first. */
  async list(): Promise<TimeEntry[]> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM time_entries WHERE team_id = ? AND user_id = ? ORDER BY started_at DESC, id DESC",
      args: [this.teamId, this.userId],
    });
    return (rows as unknown as TimeEntryRow[]).map(toTimeEntry);
  }

  async get(id: number): Promise<TimeEntry | undefined> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM time_entries WHERE id = ? AND team_id = ? AND user_id = ?",
      args: [id, this.teamId, this.userId],
    });
    const row = rows[0] as unknown as TimeEntryRow | undefined;
    return row && toTimeEntry(row);
  }

  /** Starts a timer (or a focus session) now. Any running timer is stopped first. */
  async start(input: StartTimerInput): Promise<TimeEntry> {
    // One batch = one transaction, so there's never a moment with two running timers.
    const [, inserted] = await this.db.batch(
      [
        this.stopRunning(),
        {
          sql: `INSERT INTO time_entries (team_id, user_id, task_id, kind, started_at) VALUES (?, ?, ?, ?, ${NOW})`,
          args: [this.teamId, this.userId, input.taskId ?? null, input.kind ?? "timer"],
        },
      ],
      "write",
    );
    return (await this.get(Number(inserted.lastInsertRowid)))!;
  }

  /** Stops this person's running timer (in any team). Returns it, or undefined if none was running. */
  async stop(): Promise<TimeEntry | undefined> {
    const running = { sql: "SELECT * FROM time_entries WHERE ended_at IS NULL AND user_id = ?", args: [this.userId] };
    const { rows } = await this.db.execute(running);
    if (rows.length === 0) return undefined;
    const id = Number(rows[0].id);
    await this.db.execute(this.stopRunning());
    const stopped = await this.db.execute({ sql: "SELECT * FROM time_entries WHERE id = ?", args: [id] });
    return toTimeEntry(stopped.rows[0] as unknown as TimeEntryRow);
  }

  /** Adds time by hand (it already has a start and an end). */
  async create(input: CreateTimeEntryInput): Promise<TimeEntry> {
    const result = await this.db.execute({
      sql: `INSERT INTO time_entries (team_id, user_id, task_id, kind, started_at, ended_at, note)
            VALUES (?, ?, ?, 'manual', ?, ?, ?)`,
      args: [
        this.teamId,
        this.userId,
        input.taskId ?? null,
        toUtcTimestamp(input.startedAt),
        toUtcTimestamp(input.endedAt),
        input.note?.trim() ?? "",
      ],
    });
    return (await this.get(Number(result.lastInsertRowid)))!;
  }

  /** Returns the updated entry, or undefined if no entry has this id. */
  async update(id: number, input: UpdateTimeEntryInput): Promise<TimeEntry | undefined> {
    const assignments: string[] = [];
    const args: InValue[] = [];
    for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
      const value = input[field as keyof UpdateTimeEntryInput];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      if (field === "startedAt" || field === "endedAt") args.push(toUtcTimestamp(value as string));
      else args.push(typeof value === "string" ? value.trim() : value);
    }
    if (assignments.length > 0) {
      await this.db.execute({
        sql: `UPDATE time_entries SET ${assignments.join(", ")} WHERE id = ? AND team_id = ? AND user_id = ?`,
        args: [...args, id, this.teamId, this.userId],
      });
    }
    return this.get(id);
  }

  /** Returns false if no entry had this id. */
  async delete(id: number): Promise<boolean> {
    const { rowsAffected } = await this.db.execute({
      sql: "DELETE FROM time_entries WHERE id = ? AND team_id = ? AND user_id = ?",
      args: [id, this.teamId, this.userId],
    });
    return rowsAffected > 0;
  }
}
