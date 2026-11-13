import type { Client } from "@libsql/client";
import type { FastifyInstance } from "fastify";
import { goalsForPerson } from "../goal-store.js";
import { tasksForPerson } from "../task-store.js";
import type { TeamStore } from "../team-store.js";
import type { MyWorkGroup } from "../types.js";

/**
 * GET /my-work: everything on your plate, in all your teams at once (personal team first).
 * Needs a login, but no X-Team-Id header: it isn't about one team.
 */
export async function myWorkRoutes(app: FastifyInstance, opts: { db: Client; teams: TeamStore }) {
  const { db, teams } = opts;

  app.get("/my-work", async (request): Promise<MyWorkGroup[]> => {
    const userId = request.user.id;
    // Three independent reads, so they can run at the same time.
    const [myTeams, tasks, goals] = await Promise.all([
      teams.teamsFor(userId),
      tasksForPerson(db, userId),
      goalsForPerson(db, userId),
    ]);
    return myTeams.map((team) => ({
      team,
      tasks: tasks.get(team.id) ?? [],
      goals: goals.get(team.id) ?? [],
    }));
  });
}
