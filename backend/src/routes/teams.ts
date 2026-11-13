import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EMAIL_SCHEMA, normalizeEmail } from "../account-store.js";
import type { OrganizationStore } from "../organization-store.js";
import type { TeamStore } from "../team-store.js";
import type { TeamSummary } from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const teamName = { type: "string", minLength: 1, maxLength: 60, pattern: "\\S" } as const;
const id = { type: "integer", minimum: 1 } as const;
const organizationId = { type: ["integer", "null"], minimum: 1 } as const;
const teamParams = { type: "object", required: ["id"], properties: { id } } as const;

interface TeamParams {
  id: number;
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.code(statusCode).send({ statusCode, error, message });
}

const TEAM_NOT_FOUND = "That team doesn't exist, or you're no longer in it.";
const MANAGERS_ONLY = "Only the team's owner (or an admin of its organization) can do that.";
const NOT_FOR_PERSONAL = "Your personal space is just for you, so it can't be renamed, deleted or shared.";
const ORGANIZATION_NOT_FOUND = "That organization doesn't exist, or you're not in it.";
const ADMINS_ONLY = "Only the organization's admins can move teams in or out of it.";

/**
 * Creating and managing teams, their members and invites. These routes say which team
 * they're about in the URL (/teams/:id/...), not in the X-Team-Id header.
 * Every route here needs a login (see build-app.ts).
 * "Manage" = you own the team, or you're an admin of its organization (team.canManage).
 */
export async function teamRoutes(
  app: FastifyInstance,
  opts: { teams: TeamStore; organizations: OrganizationStore },
) {
  const { teams, organizations } = opts;

  /**
   * The team from the URL, if you're in it (and may manage it, when `manage`).
   * When something's wrong it sends the error reply and returns undefined.
   */
  async function findTeam(
    request: FastifyRequest<{ Params: TeamParams }>,
    reply: FastifyReply,
    { manage = false, notPersonal = false } = {},
  ): Promise<TeamSummary | undefined> {
    const team = await teams.membership(request.params.id, request.user.id);
    if (!team) {
      sendError(reply, 404, "Not Found", TEAM_NOT_FOUND);
    } else if (notPersonal && team.personal) {
      sendError(reply, 400, "Bad Request", NOT_FOR_PERSONAL);
    } else if (manage && !team.canManage) {
      sendError(reply, 403, "Forbidden", MANAGERS_ONLY);
    } else {
      return team;
    }
    return undefined;
  }

  /** Whether you're an admin of the organization. */
  async function isAdmin(organization: number, userId: number) {
    return (await organizations.membership(organization, userId))?.role === "admin";
  }

  // Creates a team (on its own, or in one of your organizations); you become its owner.
  app.post<{ Body: { name: string; organizationId?: number | null } }>(
    "/teams",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: teamName, organizationId },
        },
      },
    },
    async (request, reply) => {
      const { name, organizationId: inOrganization = null } = request.body;
      if (inOrganization !== null && !(await organizations.membership(inOrganization, request.user.id))) {
        return sendError(reply, 404, "Not Found", ORGANIZATION_NOT_FOUND);
      }
      return reply.code(201).send(await teams.create(name, request.user.id, inOrganization));
    },
  );

  // Renames a team, and/or moves it into an organization (or out of one, with null).
  app.patch<{ Params: TeamParams; Body: { name?: string; organizationId?: number | null } }>(
    "/teams/:id",
    {
      schema: {
        params: teamParams,
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: { name: teamName, organizationId },
        },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { manage: true, notPersonal: true });
      if (!team) return reply;
      const target = request.body.organizationId;
      if (target !== undefined && target !== team.organizationId) {
        // Moving needs admin rights on both sides: the organization it leaves (so a team
        // owner can't just walk off with an organization's team) and the one it joins.
        if (target !== null && !(await organizations.membership(target, request.user.id))) {
          return sendError(reply, 404, "Not Found", ORGANIZATION_NOT_FOUND);
        }
        const leavesOk = team.organizationId === null || (await isAdmin(team.organizationId, request.user.id));
        const joinsOk = target === null || (await isAdmin(target, request.user.id));
        if (!leavesOk || !joinsOk) return sendError(reply, 403, "Forbidden", ADMINS_ONLY);
        await teams.setOrganization(team.id, target);
      }
      if (request.body.name !== undefined) await teams.rename(team.id, request.body.name);
      return teams.membership(team.id, request.user.id);
    },
  );

  // Deletes the team with ALL its tasks, goals and tracked time.
  app.delete<{ Params: TeamParams }>("/teams/:id", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply, { manage: true, notPersonal: true });
    if (!team) return reply;
    await teams.delete(team.id);
    return reply.code(204).send();
  });

  app.get<{ Params: TeamParams }>("/teams/:id/members", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply);
    if (!team) return reply;
    return teams.members(team.id);
  });

  // In an organization's team: add a colleague (someone in the organization) straight away,
  // without an invite link.
  app.post<{ Params: TeamParams; Body: { userId: number } }>(
    "/teams/:id/members",
    {
      schema: {
        params: teamParams,
        body: { type: "object", required: ["userId"], additionalProperties: false, properties: { userId: id } },
      },
    },
    async (request, reply) => {
      const team = await findTeam(request, reply, { manage: true, notPersonal: true });
      if (!team) return reply;
      if (team.organizationId === null) {
        return sendError(reply, 400, "Bad Request", "Only teams in an organization can add people directly. Send an invite link instead.");
      }
      if (!(await organizations.membership(team.organizationId, request.body.userId))) {
        return sendError(reply, 400, "Bad Request", "That person isn't in this team's organization. Invite them with a link instead.");
      }
      await teams.addMember(team.id, request.body.userId);
      return reply.code(201).send(await teams.members(team.id));
    },
  );

  // A manager removes someone, or a member leaves (removes themself).
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
      if (!leaving && !team.canManage) return sendError(reply, 403, "Forbidden", MANAGERS_ONLY);
      const target = await teams.membership(team.id, request.params.userId);
      if (!target) return sendError(reply, 404, "Not Found", "That person isn't in this team.");
      if (target.role === "owner") {
        // Every team keeps an owner. (Organization admins can remove an owner from the whole
        // organization; their teams are then handed over.)
        return sendError(reply, 400, "Bad Request", "The team's owner can't be removed from it.");
      }
      await teams.removeMember(team.id, request.params.userId);
      return reply.code(204).send();
    },
  );

  // Invites waiting to be accepted (only managers see them, since they contain the links).
  app.get<{ Params: TeamParams }>("/teams/:id/invites", { schema: { params: teamParams } }, async (request, reply) => {
    const team = await findTeam(request, reply, { manage: true });
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
      const team = await findTeam(request, reply, { manage: true, notPersonal: true });
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
      const team = await findTeam(request, reply, { manage: true });
      if (!team) return reply;
      if (!(await teams.deleteInvite(team.id, request.params.inviteId))) {
        return sendError(reply, 404, "Not Found", "That invite doesn't exist (it may have been used already).");
      }
      return reply.code(204).send();
    },
  );
}
