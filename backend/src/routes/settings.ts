import type { FastifyInstance, FastifyReply } from "fastify";
import type { BackupStore } from "../backup-store.js";
import type { SettingsStore } from "../settings-store.js";
import {
  GOAL_COLORS,
  PRIORITIES,
  STATUSES,
  THEMES,
  TIME_ENTRY_KINDS,
  type Backup,
  type UpdateSettingsInput,
} from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.

/** A time of day like "09:00" or "17:30". */
const timeOfDay = { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" } as const;

const settingsFields = {
  theme: { type: "string", enum: THEMES },
  focusMinutes: { type: "integer", minimum: 5, maximum: 120 },
  breakMinutes: { type: "integer", minimum: 1, maximum: 60 },
  timerSounds: { type: "boolean" },
  // 0 = Sunday, 1 = Monday
  weekStartsOn: { type: "integer", enum: [0, 1] },
  notifications: {
    type: "object",
    additionalProperties: false,
    properties: {
      started: { type: "boolean" },
      dueSoon: { type: "boolean" },
      done: { type: "boolean" },
      focus: { type: "boolean" },
    },
  },
  defaultStartTime: timeOfDay,
  defaultDueTime: timeOfDay,
  defaultPriority: { type: "string", enum: PRIORITIES },
  tagSuggestions: {
    type: "array",
    maxItems: 20,
    uniqueItems: true,
    items: { type: "string", minLength: 1, maxLength: 30, pattern: "\\S" },
  },
} as const;

const timestamp = { type: "string", format: "date-time" } as const;
const nullableTimestamp = { type: ["string", "null"], format: "date-time" } as const;
const id = { type: "integer", minimum: 1 } as const;
const nullableId = { type: ["integer", "null"], minimum: 1 } as const;

/** What a backup file must look like (the same shape GET /export returns). */
const backupSchema = {
  type: "object",
  required: ["app", "version", "goals", "tasks", "timeEntries"],
  properties: {
    app: { const: "DoSprout" },
    version: { const: 1 },
    settings: { type: "object", properties: settingsFields },
    goals: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "description", "color", "targetDate", "createdAt", "updatedAt"],
        properties: {
          id,
          title: { type: "string", minLength: 1, maxLength: 100 },
          description: { type: "string", maxLength: 1000 },
          color: { type: "string", enum: GOAL_COLORS },
          targetDate: { type: ["string", "null"], format: "date" },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id", "title", "description", "status", "priority", "tag", "startAt", "dueAt", "position",
          "createdAt", "updatedAt", "completedAt", "goalId", "estimateMinutes", "subtasks",
        ],
        properties: {
          id,
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 2000 },
          status: { type: "string", enum: STATUSES },
          priority: { type: "string", enum: PRIORITIES },
          tag: { type: "string", maxLength: 30 },
          startAt: nullableTimestamp,
          dueAt: nullableTimestamp,
          position: { type: "number" },
          createdAt: timestamp,
          updatedAt: timestamp,
          completedAt: nullableTimestamp,
          goalId: nullableId,
          estimateMinutes: { type: ["integer", "null"], minimum: 1, maximum: 60000 },
          subtasks: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title", "done", "position"],
              properties: {
                id,
                title: { type: "string", minLength: 1, maxLength: 200 },
                done: { type: "boolean" },
                position: { type: "integer" },
              },
            },
          },
        },
      },
    },
    timeEntries: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "taskId", "kind", "startedAt", "endedAt", "note", "createdAt"],
        properties: {
          id,
          taskId: nullableId,
          kind: { type: "string", enum: TIME_ENTRY_KINDS },
          startedAt: timestamp,
          endedAt: nullableTimestamp,
          note: { type: "string", maxLength: 500 },
          createdAt: timestamp,
        },
      },
    },
  },
} as const;

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: "Bad Request", message });
}

/** Checks that the backup's links point at things inside it. Returns a problem, or null. */
function brokenLink(backup: Backup): string | null {
  const goalIds = new Set(backup.goals.map((goal) => goal.id));
  const taskIds = new Set(backup.tasks.map((task) => task.id));
  const task = backup.tasks.find((t) => t.goalId !== null && !goalIds.has(t.goalId));
  if (task) return `The task "${task.title}" belongs to a goal that isn't in the file.`;
  if (backup.timeEntries.some((entry) => entry.taskId !== null && !taskIds.has(entry.taskId))) {
    return "Some tracked time belongs to a task that isn't in the file.";
  }
  return null;
}

export async function settingsRoutes(
  app: FastifyInstance,
  opts: { settings: SettingsStore; backup: BackupStore },
) {
  const { settings, backup } = opts;

  app.get("/settings", async () => settings.get());

  app.patch<{ Body: UpdateSettingsInput }>(
    "/settings",
    {
      schema: {
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: settingsFields },
      },
    },
    async (request) => settings.update(request.body),
  );

  // Everything as one JSON object (the Settings page saves it as a backup file).
  app.get("/export", async () => backup.export());

  // Replaces ALL data with a backup. Backups can be big, so this route accepts up to 20 MB.
  app.post<{ Body: Backup }>(
    "/import",
    { bodyLimit: 20 * 1024 * 1024, schema: { body: backupSchema } },
    async (request, reply) => {
      const problem = brokenLink(request.body);
      if (problem) return badRequest(reply, `This backup file is damaged: ${problem}`);
      await backup.import(request.body);
      return { ok: true };
    },
  );

  // Deletes every task, goal and time entry (settings stay).
  app.delete("/data", async (_request, reply) => {
    await backup.deleteAll();
    return reply.code(204).send();
  });
}
