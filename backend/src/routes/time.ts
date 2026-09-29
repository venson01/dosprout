import type { FastifyInstance, FastifyReply } from "fastify";
import type { TaskStore } from "../task-store.js";
import type { TimeStore } from "../time-store.js";
import {
  TIME_ENTRY_KINDS,
  type CreateTimeEntryInput,
  type StartTimerInput,
  type UpdateTimeEntryInput,
} from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const taskId = { type: ["integer", "null"], minimum: 1 } as const;
const timestamp = { type: "string", format: "date-time" } as const;
const note = { type: "string", maxLength: 500 } as const;

const entryIdParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

interface EntryParams {
  id: number;
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: "Bad Request", message });
}

function notFound(reply: FastifyReply, message = "Time entry not found") {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message });
}

const TASK_NOT_FOUND = "That task doesn't exist (it may have been deleted). Pick another task.";
const END_BEFORE_START = "The end time has to be after the start time.";

export async function timeRoutes(app: FastifyInstance, opts: { time: TimeStore; tasks: TaskStore }) {
  const { time, tasks } = opts;

  /** Time can only be tracked on a task that exists (or on no task). */
  async function taskMissing(id: number | null | undefined) {
    return id !== undefined && id !== null && !(await tasks.get(id));
  }

  app.get("/time-entries", async () => time.list());

  // Starts a timer now; a timer that's already running is stopped first.
  app.post<{ Body: StartTimerInput }>(
    "/time-entries/start",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: { taskId, kind: { type: "string", enum: TIME_ENTRY_KINDS.filter((k) => k !== "manual") } },
        },
      },
    },
    async (request, reply) => {
      if (await taskMissing(request.body?.taskId)) return badRequest(reply, TASK_NOT_FOUND);
      return reply.code(201).send(await time.start(request.body ?? {}));
    },
  );

  app.post("/time-entries/stop", async (_request, reply) => {
    return (await time.stop()) ?? notFound(reply, "No timer is running.");
  });

  // Adds time by hand.
  app.post<{ Body: CreateTimeEntryInput }>(
    "/time-entries",
    {
      schema: {
        body: {
          type: "object",
          required: ["startedAt", "endedAt"],
          additionalProperties: false,
          properties: { taskId, startedAt: timestamp, endedAt: timestamp, note },
        },
      },
    },
    async (request, reply) => {
      const { startedAt, endedAt } = request.body;
      if (Date.parse(endedAt) <= Date.parse(startedAt)) return badRequest(reply, END_BEFORE_START);
      if (await taskMissing(request.body.taskId)) return badRequest(reply, TASK_NOT_FOUND);
      return reply.code(201).send(await time.create(request.body));
    },
  );

  app.patch<{ Params: EntryParams; Body: UpdateTimeEntryInput }>(
    "/time-entries/:id",
    {
      schema: {
        params: entryIdParams,
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: { taskId, startedAt: timestamp, endedAt: timestamp, note },
        },
      },
    },
    async (request, reply) => {
      const existing = await time.get(request.params.id);
      if (!existing) return notFound(reply);
      // Check the times as they will be after this update (a running entry has no end yet).
      const startedAt = request.body.startedAt ?? existing.startedAt;
      const endedAt = request.body.endedAt ?? existing.endedAt;
      if (endedAt !== null && Date.parse(endedAt) <= Date.parse(startedAt)) {
        return badRequest(reply, END_BEFORE_START);
      }
      if (await taskMissing(request.body.taskId)) return badRequest(reply, TASK_NOT_FOUND);
      return (await time.update(request.params.id, request.body)) ?? notFound(reply);
    },
  );

  app.delete<{ Params: EntryParams }>(
    "/time-entries/:id",
    { schema: { params: entryIdParams } },
    async (request, reply) => {
      if (!(await time.delete(request.params.id))) return notFound(reply);
      return reply.code(204).send();
    },
  );
}
