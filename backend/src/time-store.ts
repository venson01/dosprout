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

// Stops whatever timer is running (there's at most one).
const STOP_RUNNING: InStatement = `UPDATE time_entries SET ended_at = ${NOW} WHERE ended_at IS NULL`;

/**
 * All database reads and writes for tracked time. A time entry is a stretch of
 * time spent (on a task, or on nothing in particular). While a timer runs, its
 * entry has no end yet (ended_at IS NULL). Only one timer runs at a time.
 */
export class TimeStore {
  constructor(private readonly db: Client) {}

  /** All entries, newest first. */
  async list(): Promise<TimeEntry[]> {
    const { rows } = await this.db.execute("SELECT * FROM time_entries ORDER BY started_at DESC, id DESC");
    return (rows as unknown as TimeEntryRow[]).map(toTimeEntry);
  }

  async get(id: number): Promise<TimeEntry | undefined> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM time_entries WHERE id = ?", args: [id] });
    const row = rows[0] as unknown as TimeEntryRow | undefined;
    return row && toTimeEntry(row);
  }

  /** Starts a timer (or a focus session) now. Any running timer is stopped first. */
  async start(input: StartTimerInput): Promise<TimeEntry> {
    // One batch = one transaction, so there's never a moment with two running timers.
    const [, inserted] = await this.db.batch(
      [
        STOP_RUNNING,
        {
          sql: `INSERT INTO time_entries (task_id, kind, started_at) VALUES (?, ?, ${NOW})`,
          args: [input.taskId ?? null, input.kind ?? "timer"],
        },
      ],
      "write",
    );
    return (await this.get(Number(inserted.lastInsertRowid)))!;
  }

  /** Stops the running timer. Returns it, or undefined if none was running. */
  async stop(): Promise<TimeEntry | undefined> {
    const { rows } = await this.db.execute("SELECT id FROM time_entries WHERE ended_at IS NULL");
    const running = rows[0] as unknown as { id: number } | undefined;
    if (!running) return undefined;
    await this.db.execute(STOP_RUNNING);
    return this.get(running.id);
  }

  /** Adds time by hand (it already has a start and an end). */
  async create(input: CreateTimeEntryInput): Promise<TimeEntry> {
    const result = await this.db.execute({
      sql: "INSERT INTO time_entries (task_id, kind, started_at, ended_at, note) VALUES (?, 'manual', ?, ?, ?)",
      args: [
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
        sql: `UPDATE time_entries SET ${assignments.join(", ")} WHERE id = ?`,
        args: [...args, id],
      });
    }
    return this.get(id);
  }

  /** Returns false if no entry had this id. */
  async delete(id: number): Promise<boolean> {
    const { rowsAffected } = await this.db.execute({ sql: "DELETE FROM time_entries WHERE id = ?", args: [id] });
    return rowsAffected > 0;
  }
}
