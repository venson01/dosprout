import { buildApp } from "./build-app.js";

// Settings come from environment variables (see .env.example), with sensible defaults.
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "localhost";
// A local file by default. On Vercel, set these to your Turso database's URL and token.
// "||" (not "??") so that an empty line like TURSO_DATABASE_URL= also means "use the default".
const databaseUrl = process.env.TURSO_DATABASE_URL || "file:data/todos.db";
const databaseAuthToken = process.env.TURSO_AUTH_TOKEN || undefined;
const corsOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

const app = await buildApp({
  databaseUrl,
  databaseAuthToken,
  seed: true,
  corsOrigin,
  logger: { level: process.env.LOG_LEVEL ?? "info" },
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Close the database cleanly when you press Ctrl+C.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
