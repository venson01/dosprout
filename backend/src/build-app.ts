import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { openDatabase } from "./db.js";
import { taskRoutes } from "./routes/tasks.js";
import { TaskStore } from "./task-store.js";

export interface AppOptions {
  /** Where the database is: "file:data/todos.db", a Turso "libsql://..." URL, or ":memory:" for tests. */
  databaseUrl: string;
  /** Token for a Turso cloud database (not needed for local files). */
  databaseAuthToken?: string;
  /** Add example tasks when the database is created for the first time. */
  seed?: boolean;
  /** Website(s) allowed to call this API from the browser. */
  corsOrigin?: string | string[];
  logger?: FastifyServerOptions["logger"];
}

/** Builds the Fastify app without starting it, so tests can use it directly. */
export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? false });

  const db = await openDatabase({
    url: options.databaseUrl,
    authToken: options.databaseAuthToken,
    seed: options.seed,
  });
  app.addHook("onClose", async () => db.close());

  await app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  // A friendly message if you open the API address in the browser.
  app.get("/", async () => ({
    message: "Todo API is running. The tasks are at /api/tasks",
  }));
  app.get("/api/health", async () => ({ ok: true }));
  await app.register(taskRoutes, { prefix: "/api", store: new TaskStore(db) });

  return app;
}
