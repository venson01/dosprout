import type { Client } from "@libsql/client";
import type { FastifyInstance } from "fastify";
import { PlanStore } from "../plan-store.js";
import type { EstimateSample, PlanEntry, PlanTaskInput } from "../types.js";

const taskParams = {
  type: "object",
  required: ["taskId"],
  properties: { taskId: { type: "integer", minimum: 1 } },
} as const;

/**
 * "Plan my day" and estimate accuracy. Like /my-work these span all your teams, so they
 * need a login but no X-Team-Id header.
 */
export async function planRoutes(app: FastifyInstance, { db }: { db: Client }) {
  // Each request gets a store for the person asking, so nobody sees someone else's plan.
  const storeFor = (userId: number) => new PlanStore(db, userId);

  app.get("/plan", async (request): Promise<PlanEntry[]> => storeFor(request.user.id).entries());

  app.put<{ Params: { taskId: number }; Body: PlanTaskInput }>(
    "/plan/:taskId",
    {
      schema: {
        params: taskParams,
        body: {
          type: "object",
          required: ["day"],
          additionalProperties: false,
          // A day without a time, in the person's own timezone: "2026-11-13".
          properties: { day: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" } },
        },
      },
    },
    async (request, reply) => {
      const entry = await storeFor(request.user.id).plan(request.params.taskId, request.body.day);
      if (!entry) return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Task not found" });
      return entry;
    },
  );

  app.delete<{ Params: { taskId: number } }>(
    "/plan/:taskId",
    { schema: { params: taskParams } },
    async (request, reply) => {
      await storeFor(request.user.id).unplan(request.params.taskId);
      return reply.code(204).send();
    },
  );

  app.get("/estimates", async (request): Promise<EstimateSample[]> => storeFor(request.user.id).estimateSamples());
}
