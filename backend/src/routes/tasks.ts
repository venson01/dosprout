import type { FastifyInstance, FastifyReply } from "fastify";
import { toUtcTimestamp, type TaskStore } from "../task-store.js";
import {
  PRIORITIES,
  STATUSES,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from "../types.js";

// JSON schemas: Fastify uses these to reject bad requests with a 400 error
// before our code runs, so the handlers can trust the data they receive.
const title = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } as const;
const taskFields = {
  title,
  description: { type: "string", maxLength: 2000 },
  status: { type: "string", enum: STATUSES },
  priority: { type: "string", enum: PRIORITIES },
  tag: { type: "string", maxLength: 30 },
  // ISO 8601 with a timezone, e.g. "2026-11-17T17:00:00.000Z". null = no date.
  startAt: { type: ["string", "null"], format: "date-time" },
  dueAt: { type: ["string", "null"], format: "date-time" },
} as const;

const taskIdParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

const subtaskIdParams = {
  type: "object",
  required: ["id", "subtaskId"],
  properties: {
    id: { type: "integer", minimum: 1 },
    subtaskId: { type: "integer", minimum: 1 },
  },
} as const;

interface TaskParams {
  id: number;
}
interface SubtaskParams extends TaskParams {
  subtaskId: number;
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: "Bad Request", message });
}

const DATES_OUT_OF_ORDER = "The due date can't be earlier than the start date.";

/** A task may have either date, both, or neither, but it can't be due before it starts. */
function datesInOrder(startAt: string | null | undefined, dueAt: string | null | undefined) {
  if (!startAt || !dueAt) return true;
  return toUtcTimestamp(startAt)! <= toUtcTimestamp(dueAt)!;
}

function notFound(reply: FastifyReply, what = "Task") {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message: `${what} not found` });
}

export async function taskRoutes(app: FastifyInstance, opts: { store: TaskStore }) {
  const { store } = opts;

  app.get("/tasks", async () => store.list());

  app.get<{ Params: TaskParams }>(
    "/tasks/:id",
    { schema: { params: taskIdParams } },
    async (request, reply) => (await store.get(request.params.id)) ?? notFound(reply),
  );

  app.post<{ Body: CreateTaskInput }>(
    "/tasks",
    {
      schema: {
        body: {
          type: "object",
          required: ["title"],
          additionalProperties: false,
          properties: {
            ...taskFields,
            subtasks: { type: "array", maxItems: 50, items: title },
          },
        },
      },
    },
    async (request, reply) => {
      if (!datesInOrder(request.body.startAt, request.body.dueAt)) {
        return badRequest(reply, DATES_OUT_OF_ORDER);
      }
      return reply.code(201).send(await store.create(request.body));
    },
  );

  app.patch<{ Params: TaskParams; Body: UpdateTaskInput }>(
    "/tasks/:id",
    {
      schema: {
        params: taskIdParams,
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: { ...taskFields, position: { type: "number" } },
        },
      },
    },
    async (request, reply) => {
      const existing = await store.get(request.params.id);
      if (!existing) return notFound(reply);
      // Check the dates as they will be after this update.
      const { startAt = existing.startAt, dueAt = existing.dueAt } = request.body;
      if (!datesInOrder(startAt, dueAt)) return badRequest(reply, DATES_OUT_OF_ORDER);
      return (await store.update(request.params.id, request.body)) ?? notFound(reply);
    },
  );

  app.delete<{ Params: TaskParams }>(
    "/tasks/:id",
    { schema: { params: taskIdParams } },
    async (request, reply) => {
      if (!(await store.delete(request.params.id))) return notFound(reply);
      return reply.code(204).send();
    },
  );

  // Subtask routes all reply with the whole parent task, so the frontend can
  // simply swap in the new version of the task.
  app.post<{ Params: TaskParams; Body: CreateSubtaskInput }>(
    "/tasks/:id/subtasks",
    {
      schema: {
        params: taskIdParams,
        body: {
          type: "object",
          required: ["title"],
          additionalProperties: false,
          properties: { title },
        },
      },
    },
    async (request, reply) => {
      const task = await store.addSubtask(request.params.id, request.body);
      return task ? reply.code(201).send(task) : notFound(reply);
    },
  );

  app.patch<{ Params: SubtaskParams; Body: UpdateSubtaskInput }>(
    "/tasks/:id/subtasks/:subtaskId",
    {
      schema: {
        params: subtaskIdParams,
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: { title, done: { type: "boolean" } },
        },
      },
    },
    async (request, reply) =>
      (await store.updateSubtask(request.params.id, request.params.subtaskId, request.body)) ??
      notFound(reply, "Subtask"),
  );

  app.delete<{ Params: SubtaskParams }>(
    "/tasks/:id/subtasks/:subtaskId",
    { schema: { params: subtaskIdParams } },
    async (request, reply) =>
      (await store.deleteSubtask(request.params.id, request.params.subtaskId)) ??
      notFound(reply, "Subtask"),
  );
}
