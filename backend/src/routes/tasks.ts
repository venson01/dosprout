import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasUnfinishedSubtasks, toUtcTimestamp } from "../task-store.js";
import type { TeamStore } from "../team-store.js";
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
  // The goal this task belongs to. null = no goal.
  goalId: { type: ["integer", "null"], minimum: 1 },
  // How long the task should take, in minutes (up to 1,000 hours). null = no estimate.
  estimateMinutes: { type: ["integer", "null"], minimum: 1, maximum: 60000 },
  // The team member (user id) doing the task. null = nobody.
  assigneeId: { type: ["integer", "null"], minimum: 1 },
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
const GOAL_NOT_FOUND = "That goal doesn't exist (it may have been deleted). Pick another goal.";
const ASSIGNEE_NOT_MEMBER = "That person isn't in this team (any more). Pick someone else.";
const SUBTASKS_UNFINISHED =
  "This task still has unfinished subtasks. Tick them all off first, then it's done.";

/** A task may have either date, both, or neither, but it can't be due before it starts. */
function datesInOrder(startAt: string | null | undefined, dueAt: string | null | undefined) {
  if (!startAt || !dueAt) return true;
  return toUtcTimestamp(startAt)! <= toUtcTimestamp(dueAt)!;
}

function notFound(reply: FastifyReply, what = "Task") {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message: `${what} not found` });
}

/**
 * Task routes. They work on the team the request is about (request.team, from the
 * X-Team-Id header; see useTeam in auth.ts), through request.stores.tasks.
 */
export async function taskRoutes(app: FastifyInstance, opts: { teams: TeamStore }) {
  const { teams } = opts;

  /**
   * Checks the links a task may have: its goal must exist in this team, and the
   * person it's assigned to must be in this team. Returns a problem, or null.
   */
  async function badLink(request: FastifyRequest, body: UpdateTaskInput): Promise<string | null> {
    if (body.goalId != null && !(await request.stores.goals.get(body.goalId))) return GOAL_NOT_FOUND;
    if (body.assigneeId != null && !(await teams.isMember(request.team.id, body.assigneeId))) {
      return ASSIGNEE_NOT_MEMBER;
    }
    return null;
  }

  app.get("/tasks", async (request) => request.stores.tasks.list());

  app.get<{ Params: TaskParams }>(
    "/tasks/:id",
    { schema: { params: taskIdParams } },
    async (request, reply) => (await request.stores.tasks.get(request.params.id)) ?? notFound(reply),
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
      const problem = await badLink(request, request.body);
      if (problem) return badRequest(reply, problem);
      // New subtasks always start unfinished, so a task with subtasks can't start as done.
      if (request.body.status === "done" && (request.body.subtasks?.length ?? 0) > 0) {
        return badRequest(reply, SUBTASKS_UNFINISHED);
      }
      return reply.code(201).send(await request.stores.tasks.create(request.body));
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
      const store = request.stores.tasks;
      const existing = await store.get(request.params.id);
      if (!existing) return notFound(reply);
      // Check the dates as they will be after this update.
      const { startAt = existing.startAt, dueAt = existing.dueAt } = request.body;
      if (!datesInOrder(startAt, dueAt)) return badRequest(reply, DATES_OUT_OF_ORDER);
      const problem = await badLink(request, request.body);
      if (problem) return badRequest(reply, problem);
      if (request.body.status === "done" && hasUnfinishedSubtasks(existing)) {
        return badRequest(reply, SUBTASKS_UNFINISHED);
      }
      return (await store.update(request.params.id, request.body)) ?? notFound(reply);
    },
  );

  app.delete<{ Params: TaskParams }>(
    "/tasks/:id",
    { schema: { params: taskIdParams } },
    async (request, reply) => {
      if (!(await request.stores.tasks.delete(request.params.id))) return notFound(reply);
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
      const task = await request.stores.tasks.addSubtask(request.params.id, request.body);
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
      (await request.stores.tasks.updateSubtask(request.params.id, request.params.subtaskId, request.body)) ??
      notFound(reply, "Subtask"),
  );

  app.delete<{ Params: SubtaskParams }>(
    "/tasks/:id/subtasks/:subtaskId",
    { schema: { params: subtaskIdParams } },
    async (request, reply) =>
      (await request.stores.tasks.deleteSubtask(request.params.id, request.params.subtaskId)) ??
      notFound(reply, "Subtask"),
  );
}
