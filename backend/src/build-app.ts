import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { AccountStore } from "./account-store.js";
import { requireLogin, TEAM_HEADER, useTeam } from "./auth.js";
import { openDatabase } from "./db.js";
import { OrganizationStore } from "./organization-store.js";
import { authRoutes } from "./routes/auth.js";
import { myWorkRoutes } from "./routes/my-work.js";
import { organizationRoutes } from "./routes/organizations.js";
import { profileRoutes } from "./routes/profile.js";
import { goalRoutes } from "./routes/goals.js";
import { settingsRoutes } from "./routes/settings.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/teams.js";
import { timeRoutes } from "./routes/time.js";
import { TeamStore } from "./team-store.js";

export interface AppOptions {
  /** Where the database is: "file:data/todos.db", a Turso "libsql://..." URL, or ":memory:" for tests. */
  databaseUrl: string;
  /** Token for a Turso cloud database (not needed for local files). */
  databaseAuthToken?: string;
  /** Give each new account a few example tasks. */
  seed?: boolean;
  /** Only send the login cookie over HTTPS. Turn on for the live site. */
  secureCookies?: boolean;
  /** Website(s) allowed to call this API from the browser. */
  corsOrigin?: string | string[];
  logger?: FastifyServerOptions["logger"];
}

/**
 * Builds the Fastify app without starting it, so tests can use it directly.
 * It returns right away (it isn't async), so server.ts needs no top-level
 * "await", which Vercel can't load. The plugins registered here, including
 * the database connection, run when Fastify starts: on app.listen(),
 * app.ready() or the first app.inject().
 */
export function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? false });

  app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    // Only matters when the website is on another domain (NEXT_PUBLIC_API_URL):
    // lets the browser send the login cookie and the team header.
    credentials: true,
    allowedHeaders: ["Content-Type", TEAM_HEADER],
  });

  // A friendly message if you open the API address in the browser.
  app.get("/", async () => ({
    message: "Todo API is running. The tasks are at /api/tasks",
  }));
  app.get("/api/health", async () => ({ ok: true }));

  // Opens the database, then adds the routes that use it.
  app.register(async (api) => {
    const db = await openDatabase({ url: options.databaseUrl, authToken: options.databaseAuthToken });
    api.addHook("onClose", async () => db.close());
    const accounts = new AccountStore(db);
    const teams = new TeamStore(db);
    const organizations = new OrganizationStore(db);

    // Our hooks fill these in on each request (see auth.ts). Fastify wants to know
    // about them up front.
    api.decorateRequest("user", null as never);
    api.decorateRequest("team", null as never);
    api.decorateRequest("stores", null as never);

    // Sign up, log in, invite links: open to everyone (each route checks what it needs).
    await api.register(authRoutes, {
      prefix: "/api",
      accounts,
      teams,
      organizations,
      seed: options.seed ?? false,
      secureCookies: options.secureCookies ?? false,
    });

    // Everything else needs a login. Hooks added inside a register() only apply to the
    // routes registered in there. "onRequest" runs first, before the body is even read.
    await api.register(async (loggedIn) => {
      loggedIn.addHook("onRequest", requireLogin(accounts));
      await loggedIn.register(teamRoutes, { prefix: "/api", teams, organizations });
      await loggedIn.register(organizationRoutes, { prefix: "/api", organizations, teams });
      await loggedIn.register(profileRoutes, { prefix: "/api", accounts });
      // Across all your teams, so it doesn't use the X-Team-Id header.
      await loggedIn.register(myWorkRoutes, { prefix: "/api", db, teams });

      // Routes about one team's data: the team comes from the X-Team-Id header.
      await loggedIn.register(async (inTeam) => {
        inTeam.addHook("onRequest", useTeam(db, teams));
        await inTeam.register(taskRoutes, { prefix: "/api", teams });
        await inTeam.register(goalRoutes, { prefix: "/api" });
        await inTeam.register(timeRoutes, { prefix: "/api" });
        await inTeam.register(settingsRoutes, { prefix: "/api", teams });
      });
    });
  });

  return app;
}
