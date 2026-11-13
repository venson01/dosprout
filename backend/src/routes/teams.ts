import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EMAIL_SCHEMA, normalizeEmail } from "../account-store.js";
import type { TeamStore } from "../team-store.js";
import type { TeamSummary } from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const teamName = { type: "string", minLength: 1, maxLength: 60, pattern: "\\S" } as const;
const id = { type: "integer", minimum: 1 } as const;
const teamParams = { type: "object", required: ["id"], properties: { id } } as const;

interface TeamParams {
  id: number;
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.code(statusCode).send({ statusCode, error, message });
}

const TEAM_NOT_FOUND = "That team doesn't exist, or you're no longer in it.";
const OWNER_ONLY = "Only the team's owner can do that.";
const NOT_FOR_PERSONAL = "Your personal space is just for you, so it can't be renamed, deleted or shared.";

/**
 * Creating and managing teams, their members and invites. These routes say which team
 * they're about in the URL (/teams/:id/...), not in the X-Team-Id header.
 * Every route here needs a login (see build-app.ts).
 */
export async function teamRoutes(app: FastifyInstance, opts: { teams: TeamStore }) {
  const { teams } = opts;

  /**
   * The team from the URL, if you're in it (and own it, when `ownerOnly`).
   * When something's wrong it sends the error reply and returns undefined.
   */
  async function findTeam(
    request: FastifyRequest<{ Params: TeamParams }>,
    reply: FastifyReply,
    { ownerOnly = false, notPersonal = false } = {},
  ): Promise<TeamSummary | undefined> {
    const team = await teams.membership(request.params.id, request.user.id);
    if (!team) {
      sendError(reply, 404, "Not Found", TEAM_NOT_FOUND);
    } else if (notPersonal && team.personal) {
      sendError(reply, 400, "Bad Request", NOT_FOR_PERSONAL);
    } else if (ownerOnly && team.role !== "owner") {
      sendError(reply, 403, "Forbidden", OWNER_ONLY);
    } else {
      return team;
    }
    return undefined;
  }

  // Creates a team; you become its owner.
  app.post<{ Body: { name: string } }>(
    "/teams",
    {
      schema: {
        body: { type: "object", required: ["name"], additionalProperties: false, properties: { name: teamName } },
      },
    },
    async (request, reply) => reply.code(201).send(await teams.create(request.body.name, request.user.id)),
  );

  app.patch<{ Params: TeamParams; Body: { name: string } }>(
    "/teams/:id",
    {
      schema: {
        params: teamParams,
        body: { type: "object", required: ["name"], additionalProperties: false, properties: { name: teamName } },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { ownerOnly: true, notPersonal: true });
      if (!team) return reply;
      await teams.rename(team.id, request.body.name);
      return teams.membership(team.id, request.user.id);
    },
  );

  // Deletes the team with ALL its tasks, goals and tracked time.
  app.delete<{ Params: TeamParams }>("/teams/:id", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply, { ownerOnly: true, notPersonal: true });
    if (!team) return reply;
    await teams.delete(team.id);
    return reply.code(204).send();
  });

  app.get<{ Params: TeamParams }>("/teams/:id/members", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply);
    if (!team) return reply;
    return teams.members(team.id);
  });

  // The owner removes someone, or a member leaves (removes themself).
  app.delete<{ Params: TeamParams & { userId: number } }>(
    "/teams/:id/members/:userId",
    {
      schema: {
        params: { type: "object", required: ["id", "userId"], properties: { id, userId: id } },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { notPersonal: true });
      if (!team) return reply;
      const leaving = request.params.userId === request.user.id;
      if (leaving && team.role === "owner") {
        return sendError(reply, 400, "Bad Request", "You own this team, so you can't leave it. Delete the team instead.");
      }
      if (!leaving && team.role !== "owner") return sendError(reply, 403, "Forbidden", OWNER_ONLY);
      if (!(await teams.isMember(team.id, request.params.userId))) {
        return sendError(reply, 404, "Not Found", "That person isn't in this team.");
      }
      await teams.removeMember(team.id, request.params.userId);
      return reply.code(204).send();
    },
  );

  // Invites waiting to be accepted (only the owner sees them, since they contain the links).
  app.get<{ Params: TeamParams }>("/teams/:id/invites", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply, { ownerOnly: true });
    if (!team) return reply;
    return teams.invites(team.id);
  });

  app.post<{ Params: TeamParams; Body: { email: string } }>(
    "/teams/:id/invites",
    {
      schema: {
        params: teamParams,
        body: {
          type: "object",
          required: ["email"],
          additionalProperties: false,
          properties: { email: EMAIL_SCHEMA },
        },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { ownerOnly: true, notPersonal: true });
      if (!team) return reply;
      const email = normalizeEmail(request.body.email);
      const members = await teams.members(team.id);
      if (members.some((member) => member.email === email)) {
        return sendError(reply, 409, "Conflict", `${email} is already in this team.`);
      }
      return reply.code(201).send(await teams.createInvite(team.id, email, request.user.id));
    },
  );

  app.delete<{ Params: TeamParams & { inviteId: number } }>(
    "/teams/:id/invites/:inviteId",
    {
      schema: {
        params: { type: "object", required: ["id", "inviteId"], properties: { id, inviteId: id } },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { ownerOnly: true });
      if (!team) return reply;
      if (!(await teams.deleteInvite(team.id, request.params.inviteId))) {
        return sendError(reply, 404, "Not Found", "That invite doesn't exist (it may have been used already).");
      }
      return reply.code(204).send();
    },
  );
}
