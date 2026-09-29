// Copies your local tasks (backend/data/todos.db) into the Turso database
// whose URL and token are in backend/.env (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN).
//
// Run it from the repository root:   npm run copy-to-turso
// If Turso already has tasks (e.g. the example tasks), replace them with:
//                                    npm run copy-to-turso -- --replace
import { existsSync } from "node:fs";
import { copyTasks, TargetNotEmptyError } from "../copy-tasks.js";
import { openDatabase } from "../db.js";

const LOCAL_URL = "file:data/todos.db";
const tursoUrl = process.env.TURSO_DATABASE_URL;
const replace = process.argv.includes("--replace");

if (!tursoUrl || tursoUrl === LOCAL_URL) {
  console.error(
    "Put your Turso database URL and token in backend/.env first:\n" +
      "  TURSO_DATABASE_URL=libsql://your-database.turso.io\n" +
      "  TURSO_AUTH_TOKEN=your-token",
  );
  process.exit(1);
}
if (!existsSync(LOCAL_URL.slice("file:".length))) {
  console.error("There's no local database to copy (backend/data/todos.db doesn't exist).");
  process.exit(1);
}

// openDatabase() also creates the tables in Turso if they aren't there yet.
const local = await openDatabase({ url: LOCAL_URL });
const turso = await openDatabase({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
// Only the address is printed, never the token.
const where = tursoUrl.replace(/^[a-z]+:\/\//, "");

try {
  const { tasks, subtasks, goals, timeEntries } = await copyTasks(local, turso, { replace });
  console.log(
    `Done! Copied ${tasks} tasks, ${subtasks} subtasks, ${goals} goals and ${timeEntries} time entries to ${where}.`,
  );
} catch (error) {
  if (!(error instanceof TargetNotEmptyError)) throw error;
  console.error(
    `Nothing was copied: ${where} already has ${error.taskCount} task(s).\n` +
      "To delete those and copy your local tasks instead, run:\n" +
      "  npm run copy-to-turso -- --replace",
  );
  process.exitCode = 1;
} finally {
  local.close();
  turso.close();
}
