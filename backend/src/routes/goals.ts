import type { FastifyInstance, FastifyReply } from "fastify";
import { GOAL_COLORS, type CreateGoalInput, type UpdateGoalInput } from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const goalFields = {
  title: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
  description: { type: "string", maxLength: 1000 },
  color: { type: "string", enum: GOAL_COLORS },
  // A day without a time, e.g. "2026-12-31". null = no target date.
  targetDate: { type: ["string", "null"], format: "date" },
} as const;

const goalIdParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

interface GoalParams {
  id: number;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Goal not found" });
}

/** Goal routes. Like the task routes, they work on request.team's goals (request.stores.goals). */
export async function goalRoutes(app: FastifyInstance) {
  app.get("/goals", async (request) => request.stores.goals.list());

  app.get<{ Params: GoalParams }>(
    "/goals/:id",
    { schema: { params: goalIdParams } },
    async (request, reply) => (await request.stores.goals.get(request.params.id)) ?? notFound(reply),
  );

  app.post<{ Body: CreateGoalInput }>(
    "/goals",
    {
      schema: {
        body: {
          type: "object",
          required: ["title"],
          additionalProperties: false,
          properties: goalFields,
        },
      },
    },
    async (request, reply) => reply.code(201).send(await request.stores.goals.create(request.body)),
  );

  app.patch<{ Params: GoalParams; Body: UpdateGoalInput }>(
    "/goals/:id",
    {
      schema: {
        params: goalIdParams,
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: goalFields },
      },
    },
    async (request, reply) =>
      (await request.stores.goals.update(request.params.id, request.body)) ?? notFound(reply),
  );

  // The goal's tasks are kept; they just no longer belong to a goal.
  app.delete<{ Params: GoalParams }>(
    "/goals/:id",
    { schema: { params: goalIdParams } },
    async (request, reply) => {
      if (!(await request.stores.goals.delete(request.params.id))) return notFound(reply);
      return reply.code(204).send();
    },
  );
}
