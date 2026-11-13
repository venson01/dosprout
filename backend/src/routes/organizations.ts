import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EMAIL_SCHEMA, normalizeEmail } from "../account-store.js";
import type { OrganizationStore } from "../organization-store.js";
import type { TeamStore } from "../team-store.js";
import { ORGANIZATION_ROLES, type OrganizationRole, type OrganizationSummary } from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const organizationName = { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" } as const;
const id = { type: "integer", minimum: 1 } as const;
const organizationParams = { type: "object", required: ["id"], properties: { id } } as const;
const nameBody = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: { name: organizationName },
} as const;

interface OrganizationParams {
  id: number;
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.code(statusCode).send({ statusCode, error, message });
}

const NOT_FOUND = "That organization doesn't exist, or you're not in it.";
const ADMINS_ONLY = "Only the organization's admins can do that.";
const LAST_ADMIN = "An organization needs at least one admin. Make someone else an admin first.";

/**
 * Organizations: a group of teams with admins and members (see "Accounts and teams" in
 * AGENTS.md). Every route needs a login (see build-app.ts).
 */
export async function organizationRoutes(
  app: FastifyInstance,
  opts: { organizations: OrganizationStore; teams: TeamStore },
) {
  const { organizations, teams } = opts;

  /**
   * The organization from the URL, if you're in it (and an admin, when `adminOnly`).
   * When something's wrong it sends the error reply and returns undefined.
   */
  async function findOrganization(
    request: FastifyRequest<{ Params: OrganizationParams }>,
    reply: FastifyReply,
    { adminOnly = false } = {},
  ): Promise<OrganizationSummary | undefined> {
    const organization = await organizations.membership(request.params.id, request.user.id);
    if (!organization) {
      sendError(reply, 404, "Not Found", NOT_FOUND);
    } else if (adminOnly && organization.role !== "admin") {
      sendError(reply, 403, "Forbidden", ADMINS_ONLY);
    } else {
      return organization;
    }
    return undefined;
  }

  // Creates an organization; you become its admin.
  app.post<{ Body: { name: string } }>("/organizations", { schema: { body: nameBody } }, async (request, reply) =>
    reply.code(201).send(await organizations.create(request.body.name, request.user.id)),
  );

  // Its teams (with how much is open / overdue) and its members (with their teams).
  app.get<{ Params: OrganizationParams }>(
    "/organizations/:id",
    { schema: { params: organizationParams } },
    async (request, reply) => {
      const organization = await findOrganization(request, reply);
      if (!organization) return reply;
      return organizations.details(organization, request.user.id);
    },
  );

  app.patch<{ Params: OrganizationParams; Body: { name: string } }>(
    "/organizations/:id",
    { schema: { params: organizationParams, body: nameBody } },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      await organizations.rename(organization.id, request.body.name);
      return organizations.membership(organization.id, request.user.id);
    },
  );

  // Deletes the organization. Its teams carry on as teams on their own.
  app.delete<{ Params: OrganizationParams }>(
    "/organizations/:id",
    { schema: { params: organizationParams } },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      await organizations.delete(organization.id);
      return reply.code(204).send();
    },
  );

  // Makes someone an admin, or a member again.
  app.patch<{ Params: OrganizationParams & { userId: number }; Body: { role: OrganizationRole } }>(
    "/organizations/:id/members/:userId",
    {
      schema: {
        params: { type: "object", required: ["id", "userId"], properties: { id, userId: id } },
        body: {
          type: "object",
          required: ["role"],
          additionalProperties: false,
          properties: { role: { type: "string", enum: ORGANIZATION_ROLES } },
        },
      },
    },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      const target = await organizations.membership(organization.id, request.params.userId);
      if (!target) return sendError(reply, 404, "Not Found", "That person isn't in this organization.");
      if (target.role === "admin" && request.body.role === "member" && (await organizations.adminCount(organization.id)) <= 1) {
        return sendError(reply, 400, "Bad Request", LAST_ADMIN);
      }
      await organizations.setRole(organization.id, request.params.userId, request.body.role);
      return reply.code(204).send();
    },
  );

  // An admin removes someone, or a member leaves: out of the organization AND all its teams.
  app.delete<{ Params: OrganizationParams & { userId: number } }>(
    "/organizations/:id/members/:userId",
    {
      schema: {
        params: { type: "object", required: ["id", "userId"], properties: { id, userId: id } },
      },
    },
    async (request, reply) => {
      const organization = await findOrganization(request, reply);
      if (!organization) return reply;
      const userId = request.params.userId;
      const leaving = userId === request.user.id;
      if (!leaving && organization.role !== "admin") return sendError(reply, 403, "Forbidden", ADMINS_ONLY);
      const target = await organizations.membership(organization.id, userId);
      if (!target) return sendError(reply, 404, "Not Found", "That person isn't in this organization.");
      if (target.role === "admin" && (await organizations.adminCount(organization.id)) <= 1) {
        return sendError(reply, 400, "Bad Request", LAST_ADMIN);
      }
      // Teams the person owned need a new owner: the admin doing the removing, or (when
      // someone leaves by themself) the admin who has been in the organization longest.
      const heir = leaving ? await organizations.longestServingAdmin(organization.id, userId) : request.user.id;
      await organizations.removeMember(organization.id, userId, heir!);
      return reply.code(204).send();
    },
  );

  // Admins: join one of the organization's teams (then they can open and manage it).
  app.post<{ Params: OrganizationParams & { teamId: number } }>(
    "/organizations/:id/teams/:teamId/join",
    {
      schema: {
        params: { type: "object", required: ["id", "teamId"], properties: { id, teamId: id } },
      },
    },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      const details = await organizations.details(organization, request.user.id);
      if (!details.teams.some((team) => team.id === request.params.teamId)) {
        return sendError(reply, 404, "Not Found", "That team isn't in this organization.");
      }
      await teams.addMember(request.params.teamId, request.user.id);
      return teams.membership(request.params.teamId, request.user.id);
    },
  );

  // Invites waiting to be accepted (admins only, since they contain the links).
  app.get<{ Params: OrganizationParams }>(
    "/organizations/:id/invites",
    { schema: { params: organizationParams } },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      return organizations.invites(organization.id);
    },
  );

  app.post<{ Params: OrganizationParams; Body: { email: string } }>(
    "/organizations/:id/invites",
    {
      schema: {
        params: organizationParams,
        body: { type: "object", required: ["email"], additionalProperties: false, properties: { email: EMAIL_SCHEMA } },
      },
    },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      const email = normalizeEmail(request.body.email);
      const { members } = await organizations.details(organization, request.user.id);
      if (members.some((member) => member.email === email)) {
        return sendError(reply, 409, "Conflict", `${email} is already in this organization.`);
      }
      return reply.code(201).send(await organizations.createInvite(organization.id, email, request.user.id));
    },
  );

  app.delete<{ Params: OrganizationParams & { inviteId: number } }>(
    "/organizations/:id/invites/:inviteId",
    {
      schema: {
        params: { type: "object", required: ["id", "inviteId"], properties: { id, inviteId: id } },
      },
    },
    async (request, reply) => {
      const organization = await findOrganization(request, reply, { adminOnly: true });
      if (!organization) return reply;
      if (!(await organizations.deleteInvite(organization.id, request.params.inviteId))) {
        return sendError(reply, 404, "Not Found", "That invite doesn't exist (it may have been used already).");
      }
      return reply.code(204).send();
    },
  );
}
