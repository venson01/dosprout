import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./build-app.js";
import { copyTasks, TargetNotEmptyError } from "./copy-tasks.js";
import { openDatabase } from "./db.js";
import { TaskStore } from "./task-store.js";
import { GoalStore } from "./goal-store.js";
import type { Goal, Task } from "./types.js";

// Every test gets a fresh, empty in-memory database.
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({ databaseUrl: ":memory:" });
});

afterEach(async () => {
  await app.close();
});

async function createTask(body: Record<string, unknown>): Promise<Task> {
  const response = await app.inject({ method: "POST", url: "/api/tasks", payload: body });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

describe("tasks API", () => {
  test("health check responds", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    assert.deepEqual(response.json(), { ok: true });
  });

  test("creates a task with defaults", async () => {
    const task = await createTask({ title: "  Buy milk  " });
    assert.equal(task.title, "Buy milk");
    assert.equal(task.status, "todo");
    assert.equal(task.priority, "mid");
    assert.equal(task.tag, "");
    assert.equal(task.startAt, null);
    assert.equal(task.dueAt, null);
    assert.deepEqual(task.subtasks, []);
  });

  test("creates a task with subtasks and lists it", async () => {
    await createTask({
      title: "Launch site",
      priority: "high",
      tag: "Work",
      startAt: "2026-11-16T09:00:00.000Z",
      dueAt: "2026-11-17T17:30:00.000Z",
      subtasks: ["Design", "Build"],
    });

    const response = await app.inject({ method: "GET", url: "/api/tasks" });
    const tasks: Task[] = response.json();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].startAt, "2026-11-16T09:00:00.000Z");
    assert.equal(tasks[0].dueAt, "2026-11-17T17:30:00.000Z");
    assert.deepEqual(
      tasks[0].subtasks.map((s) => [s.title, s.done]),
      [["Design", false], ["Build", false]],
    );
  });

  test("rejects invalid input", async () => {
    const cases = [
      {},
      { title: "" },
      { title: "   " },
      { title: "x", status: "archived" },
      { title: "x", priority: "urgent" },
      { title: "x", dueAt: "17/11/2026" },
      { title: "x", dueAt: "2026-11-17" },
      { title: "x", startAt: "2026-11-17T09:00" },
    ];
    for (const payload of cases) {
      const response = await app.inject({ method: "POST", url: "/api/tasks", payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
  });

  test("ignores unknown fields", async () => {
    const task = await createTask({ title: "x", unknownField: true });
    assert.equal("unknownField" in task, false);
  });

  test("stores times in UTC, whatever timezone they are sent in", async () => {
    const task = await createTask({
      title: "Call Lagos office",
      startAt: "2026-11-17T09:00:00+01:00",
      dueAt: "2026-11-17T10:30:00+01:00",
    });
    assert.equal(task.startAt, "2026-11-17T08:00:00.000Z");
    assert.equal(task.dueAt, "2026-11-17T09:30:00.000Z");
  });

  test("rejects a due date before the start date", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "x", startAt: "2026-11-17T12:00:00Z", dueAt: "2026-11-17T11:59:00Z" },
    });
    assert.equal(created.statusCode, 400);
    assert.match(created.json().message, /due date/);

    // Also when only one of the two dates changes.
    const task = await createTask({ title: "y", startAt: "2026-11-17T12:00:00Z" });
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { dueAt: "2026-11-16T12:00:00Z" },
    });
    assert.equal(updated.statusCode, 400);

    // Same start and due time is fine.
    const same = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { dueAt: "2026-11-17T12:00:00Z" },
    });
    assert.equal(same.statusCode, 200);
  });

  test("updates a task and moves it to the end of its new column", async () => {
    await createTask({ title: "Already done", status: "done" });
    const task = await createTask({ title: "Write report" });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { status: "done", dueAt: null, title: "Write final report" },
    });
    assert.equal(response.statusCode, 200);
    const updated: Task = response.json();
    assert.equal(updated.title, "Write final report");
    assert.equal(updated.status, "done");
    assert.equal(updated.position, 1);
  });

  test("returns 404 for tasks that do not exist", async () => {
    for (const [method, url] of [
      ["GET", "/api/tasks/999"],
      ["PATCH", "/api/tasks/999"],
      ["DELETE", "/api/tasks/999"],
    ] as const) {
      const response = await app.inject({ method, url, payload: { title: "x" } });
      assert.equal(response.statusCode, 404, `${method} ${url}`);
    }
  });

  test("deletes a task together with its subtasks", async () => {
    const task = await createTask({ title: "Temp", subtasks: ["a"] });
    const response = await app.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
    assert.equal(response.statusCode, 204);
    const list = await app.inject({ method: "GET", url: "/api/tasks" });
    assert.deepEqual(list.json(), []);
  });

  test("adds, toggles, renames and deletes subtasks", async () => {
    const task = await createTask({ title: "Plan trip" });

    const added = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: "Book flights" },
    });
    assert.equal(added.statusCode, 201);
    const subtaskId = (added.json() as Task).subtasks[0].id;
    const subtaskUrl = `/api/tasks/${task.id}/subtasks/${subtaskId}`;

    const toggled = await app.inject({
      method: "PATCH",
      url: subtaskUrl,
      payload: { done: true, title: "Book cheap flights" },
    });
    assert.deepEqual(
      (toggled.json() as Task).subtasks.map((s) => [s.title, s.done]),
      [["Book cheap flights", true]],
    );

    const deleted = await app.inject({ method: "DELETE", url: subtaskUrl });
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual((deleted.json() as Task).subtasks, []);

    const missing = await app.inject({ method: "DELETE", url: subtaskUrl });
    assert.equal(missing.statusCode, 404);
  });

  test("ticking subtasks moves the task to in progress, then done", async () => {
    const task = await createTask({ title: "Move house", subtasks: ["Pack", "Drive"] });
    const [pack, drive] = task.subtasks;
    const tick = async (subtaskId: number, done: boolean) => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/subtasks/${subtaskId}`,
        payload: { done },
      });
      return (response.json() as Task).status;
    };

    assert.equal(task.status, "todo");
    assert.equal(await tick(pack.id, true), "in_progress"); // one of two done
    assert.equal(await tick(drive.id, true), "done"); // all done
    assert.equal(await tick(drive.id, false), "in_progress"); // one undone again
    assert.equal(await tick(pack.id, false), "in_progress"); // none done: left alone

    // Adding an unfinished subtask to a finished task reopens it.
    await tick(pack.id, true);
    assert.equal(await tick(drive.id, true), "done");
    const added = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: "Unpack" },
    });
    assert.equal((added.json() as Task).status, "in_progress");

    // Deleting the only unfinished subtask finishes it.
    const unpack = (added.json() as Task).subtasks.at(-1)!;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${task.id}/subtasks/${unpack.id}`,
    });
    assert.equal((deleted.json() as Task).status, "done");
  });

  test("unticking the only subtask of a done task moves it back to to do", async () => {
    const task = await createTask({ title: "Call mum", subtasks: ["Call"] });
    const url = `/api/tasks/${task.id}/subtasks/${task.subtasks[0].id}`;
    await app.inject({ method: "PATCH", url, payload: { done: true } });
    const response = await app.inject({ method: "PATCH", url, payload: { done: false } });
    assert.equal((response.json() as Task).status, "todo");
  });

  test("a task with unfinished subtasks can't be marked done", async () => {
    const task = await createTask({ title: "Launch", subtasks: ["Build", "Ship"] });
    const url = `/api/tasks/${task.id}`;

    const blocked = await app.inject({ method: "PATCH", url, payload: { status: "done" } });
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.json().message, /unfinished subtasks/);
    const unchanged = await app.inject({ method: "GET", url });
    assert.equal((unchanged.json() as Task).status, "todo");

    // Creating it as done straight away is blocked too (new subtasks start unfinished)...
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Too soon", status: "done", subtasks: ["Step"] },
    });
    assert.equal(created.statusCode, 400);
    // ...but a task without subtasks can be.
    assert.equal((await createTask({ title: "Simple", status: "done" })).status, "done");

    // Once every subtask is ticked it's done, and it can go back and forth after that.
    for (const subtask of task.subtasks) {
      await app.inject({ method: "PATCH", url: `${url}/subtasks/${subtask.id}`, payload: { done: true } });
    }
    await app.inject({ method: "PATCH", url, payload: { status: "in_progress" } });
    const done = await app.inject({ method: "PATCH", url, payload: { status: "done" } });
    assert.equal(done.statusCode, 200);
  });

  test("remembers when a task was completed", async () => {
    const task = await createTask({ title: "Water plants" });
    assert.equal(task.completedAt, null);
    const patch = async (payload: object, url = `/api/tasks/${task.id}`) =>
      (await app.inject({ method: "PATCH", url, payload })).json() as Task;

    const done = await patch({ status: "done" });
    assert.ok(done.completedAt, "set when moved to done");
    assert.ok(Math.abs(Date.parse(done.completedAt) - Date.now()) < 60_000);

    assert.equal((await patch({ title: "Water all plants" })).completedAt, done.completedAt);
    assert.equal((await patch({ status: "todo" })).completedAt, null, "cleared when reopened");

    // Finishing a task by ticking every subtask counts too.
    const withSubtask = await createTask({ title: "Water balcony", subtasks: ["Balcony"] });
    const bySubtasks = await patch(
      { done: true },
      `/api/tasks/${withSubtask.id}/subtasks/${withSubtask.subtasks[0].id}`,
    );
    assert.equal(bySubtasks.status, "done");
    assert.ok(bySubtasks.completedAt);

    const createdDone = await createTask({ title: "Already finished", status: "done" });
    assert.ok(createdDone.completedAt);
  });

  test("a subtask can only be changed through its own task", async () => {
    const first = await createTask({ title: "First", subtasks: ["mine"] });
    const second = await createTask({ title: "Second" });
    const response = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${second.id}/subtasks/${first.subtasks[0].id}`,
      payload: { done: true },
    });
    assert.equal(response.statusCode, 404);
  });
});

describe("goals API", () => {
  async function createGoal(body: Record<string, unknown>): Promise<Goal> {
    const response = await app.inject({ method: "POST", url: "/api/goals", payload: body });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  test("creates, lists, updates and deletes goals", async () => {
    const goal = await createGoal({ title: "  Get fit  ", targetDate: "2026-12-31" });
    assert.equal(goal.title, "Get fit");
    assert.equal(goal.description, "");
    assert.equal(goal.color, "blue");
    assert.equal(goal.targetDate, "2026-12-31");

    const list = await app.inject({ method: "GET", url: "/api/goals" });
    assert.deepEqual(
      (list.json() as Goal[]).map((g) => g.title),
      ["Get fit"],
    );

    const url = `/api/goals/${goal.id}`;
    const updated = await app.inject({
      method: "PATCH",
      url,
      payload: { color: "aqua", description: "Run 5k", targetDate: null },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(
      [(updated.json() as Goal).color, (updated.json() as Goal).description, (updated.json() as Goal).targetDate],
      ["aqua", "Run 5k", null],
    );

    const deleted = await app.inject({ method: "DELETE", url });
    assert.equal(deleted.statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 404);
  });

  test("rejects invalid goals", async () => {
    for (const payload of [
      {},
      { title: "   " },
      { title: "x", color: "rainbow" },
      { title: "x", targetDate: "next week" },
      { title: "x", targetDate: "2026-12-31T10:00:00Z" },
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/goals", payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
  });

  test("tasks can belong to a goal, and deleting the goal keeps its tasks", async () => {
    const goal = await createGoal({ title: "Move house" });
    const task = await createTask({ title: "Pack boxes", goalId: goal.id });
    assert.equal(task.goalId, goal.id);

    // Unlink and link again with PATCH.
    const unlinked = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: null } });
    assert.equal((unlinked.json() as Task).goalId, null);
    await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: goal.id } });

    await app.inject({ method: "DELETE", url: `/api/goals/${goal.id}` });
    const after = await app.inject({ method: "GET", url: `/api/tasks/${task.id}` });
    assert.equal(after.statusCode, 200, "the task still exists");
    assert.equal((after.json() as Task).goalId, null, "and no longer points at the deleted goal");
  });

  test("a task can't point at a goal that doesn't exist", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Orphan", goalId: 999 },
    });
    assert.equal(created.statusCode, 400);
    assert.match(created.json().message, /goal doesn't exist/);

    const task = await createTask({ title: "Plain" });
    const patched = await app.inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: 999 } });
    assert.equal(patched.statusCode, 400);
  });
});

describe("copying tasks to another database", () => {
  test("copies every task and subtask exactly, and refuses to overwrite unless asked", async () => {
    const from = await openDatabase({ url: ":memory:", seed: true });
    const to = await openDatabase({ url: ":memory:", seed: true });
    const fromStore = new TaskStore(from);
    await fromStore.create({ title: "Only in the source", subtasks: ["x"] });

    // The target has the example tasks, so it isn't empty.
    await assert.rejects(copyTasks(from, to), TargetNotEmptyError);

    const result = await copyTasks(from, to, { replace: true });
    assert.equal(result.tasks, 6);
    const toStore = new TaskStore(to);
    assert.deepEqual(await toStore.list(), await fromStore.list());
    // Goals come along too (the example data has one, linked to three tasks).
    assert.equal(result.goals, 1);
    assert.deepEqual(await new GoalStore(to).list(), await new GoalStore(from).list());

    // New tasks in the target don't reuse the copied ids.
    const next = await toStore.create({ title: "After the copy" });
    assert.ok(next.id > Math.max(...(await fromStore.list()).map((t) => t.id)));

    from.close();
    to.close();
  });
});

describe("database upgrade", () => {
  test("turns old due dates into 5 PM local time", async () => {
    const folder = mkdtempSync(join(tmpdir(), "todo-test-"));
    const path = join(folder, "old.db");
    try {
      // Build a database the way version 1 of the app left it.
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
          priority TEXT NOT NULL DEFAULT 'mid', tag TEXT NOT NULL DEFAULT '', due_date TEXT,
          position REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE subtasks (id INTEGER PRIMARY KEY, task_id INTEGER, title TEXT,
          done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
        INSERT INTO tasks (title, due_date) VALUES ('Has date', '2026-09-30'), ('No date', NULL);
        PRAGMA user_version = 1;
      `);
      old.close();

      const db = await openDatabase({ url: `file:${path}`, seed: true });
      const { rows } = await db.execute("SELECT title, start_at, due_at FROM tasks ORDER BY id");
      db.close();

      assert.deepEqual(
        rows.map((row) => ({ title: row.title, start_at: row.start_at, due_at: row.due_at })),
        [
          { title: "Has date", start_at: null, due_at: new Date(2026, 8, 30, 17, 0).toISOString() },
          { title: "No date", start_at: null, due_at: null },
        ],
      );
    } finally {
      // On Windows the database library keeps the file locked until the test
      // process ends, so deleting it can fail. It's in the temp folder anyway.
      try {
        rmSync(folder, { recursive: true, force: true });
      } catch {
        // Ignore: Windows cleans up its temp folder by itself.
      }
    }
  });
});
