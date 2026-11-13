import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EMAIL_SCHEMA, normalizeEmail, type AccountStore } from "../account-store.js";
import { clearedSessionCookie, readCookie, requireLogin, SESSION_COOKIE, sessionCookie } from "../auth.js";
import type { OrganizationStore } from "../organization-store.js";
import { hashPassword, verifyPassword } from "../passwords.js";
import type { TeamStore } from "../team-store.js";
import type { AcceptedInvite, LoginInput, Me, SignupInput, User } from "../types.js";

// JSON schemas: Fastify rejects bad requests with a 400 error before our code runs.
const password = { type: "string", minLength: 8, maxLength: 200 } as const;
const token = { type: "string", minLength: 1, maxLength: 100 } as const;
const tokenParams = { type: "object", required: ["token"], properties: { token } } as const;

export interface AuthRouteOptions {
  accounts: AccountStore;
  teams: TeamStore;
  organizations: OrganizationStore;
  /** Give new accounts example tasks. */
  seed: boolean;
  /** Mark the login cookie "Secure" (HTTPS only). On for the live site. */
  secureCookies: boolean;
}

const INVITE_GONE = "This invite link has expired or was already used. Ask the team owner for a new one.";

/** Sign up, log in, log out, "who am I", and looking at / accepting invite links. */
export async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions) {
  const { accounts, teams, organizations, seed, secureCookies } = opts;
  const loggedIn = requireLogin(accounts);

  async function me(user: User): Promise<Me> {
    const [myTeams, myOrganizations] = await Promise.all([teams.teamsFor(user.id), organizations.forUser(user.id)]);
    return { user, teams: myTeams, organizations: myOrganizations };
  }

  /**
   * The invite behind a link. Team and organization invites share the /invite/<token>
   * links, so look in both (the tokens are long and random, so they can't clash).
   */
  async function findInvite(inviteToken: string) {
    const team = await teams.inviteByToken(inviteToken);
    if (team) return { kind: "team" as const, ...team };
    const organization = await organizations.inviteByToken(inviteToken);
    if (organization) return { kind: "organization" as const, ...organization };
    return undefined;
  }

  /** Uses up an invite: joins its team or organization. */
  async function accept(found: NonNullable<Awaited<ReturnType<typeof findInvite>>>, userId: number): Promise<AcceptedInvite> {
    if (found.kind === "team") {
      return { kind: "team", id: (await teams.acceptInvite(found.invite, userId)).id };
    }
    return { kind: "organization", id: (await organizations.acceptInvite(found.invite, userId)).id };
  }

  /** Logs the user in: a new session, its token in a cookie. */
  async function startSession(reply: FastifyReply, user: User) {
    const sessionToken = await accounts.createSession(user.id);
    reply.header("set-cookie", sessionCookie(sessionToken, secureCookies));
  }

  app.post<{ Body: SignupInput }>(
    "/auth/signup",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "password"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60, pattern: "\\S" },
            email: EMAIL_SCHEMA,
            password,
            inviteToken: token,
          },
        },
      },
    },
    async (request, reply) => {
      const { name, inviteToken } = request.body;
      if (await accounts.findByEmail(request.body.email)) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "There's already an account with this email. Log in instead.",
        });
      }
      // Check the invite before creating anything, so a bad link doesn't leave half an account.
      const invite = inviteToken ? await findInvite(inviteToken) : undefined;
      if (inviteToken && !invite) return badRequest(reply, INVITE_GONE);
      if (invite && invite.invite.email !== normalizeEmail(request.body.email)) {
        return badRequest(reply, `This invite is for ${invite.invite.email}. Sign up with that email address.`);
      }

      const passwordHash = await hashPassword(request.body.password);
      const { user } = await accounts.createUser({ name, email: request.body.email, passwordHash }, { seed });
      if (invite) await accept(invite, user.id);
      await startSession(reply, user);
      return reply.code(201).send(await me(user));
    },
  );

  app.post<{ Body: LoginInput }>(
    "/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          // No length rules on the password here: just check whether it's right.
          properties: { email: { type: "string", maxLength: 254 }, password: { type: "string", maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      const found = await accounts.findByEmail(request.body.email);
      // The same message whether the email or the password is wrong, so nobody can use
      // this form to find out who has an account.
      if (!found || !(await verifyPassword(request.body.password, found.passwordHash))) {
        return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Wrong email or password." });
      }
      await startSession(reply, found.user);
      return me(found.user);
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    if (sessionToken) await accounts.deleteSession(sessionToken);
    reply.header("set-cookie", clearedSessionCookie(secureCookies));
    return reply.code(204).send();
  });

  app.get("/auth/me", { onRequest: loggedIn }, async (request) => me(request.user));

  // Anyone with the link may see which team or organization it's for (no login needed), so
  // the invite page can say "Ada invited you to Marketing" before you sign up.
  app.get<{ Params: { token: string } }>(
    "/invites/:token",
    { schema: { params: tokenParams } },
    async (request, reply) => {
      const found = await findInvite(request.params.token);
      return found ? found.preview : notFound(reply);
    },
  );

  // Joins the invite's team or organization. Only the person the invite was sent to can use it.
  app.post<{ Params: { token: string } }>(
    "/invites/:token/accept",
    { onRequest: loggedIn, schema: { params: tokenParams } },
    async (request: FastifyRequest<{ Params: { token: string } }>, reply) => {
      const found = await findInvite(request.params.token);
      if (!found) return notFound(reply);
      if (found.invite.email !== request.user.email) {
        return reply.code(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: `This invite is for ${found.invite.email}, but you're logged in as ${request.user.email}. Log out and use that account.`,
        });
      }
      return accept(found, request.user.id);
    },
  );
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: "Bad Request", message });
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ statusCode: 404, error: "Not Found", message: INVITE_GONE });
}
