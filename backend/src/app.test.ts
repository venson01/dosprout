import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "./build-app.js";
import { copyTasks, TargetNotEmptyError } from "./copy-tasks.js";
import { openDatabase } from "./db.js";
import { exampleDataStatements } from "./example-data.js";
import { TaskStore } from "./task-store.js";
import { GoalStore } from "./goal-store.js";
import {
  DEFAULT_SETTINGS,
  type Backup,
  type Goal,
  type Invite,
  type InvitePreview,
  type Me,
  type AcceptedInvite,
  type Member,
  type MyWorkGroup,
  type OrganizationDetails,
  type OrganizationInvite,
  type OrganizationSummary,
  type EstimateSample,
  type PlanEntry,
  type Settings,
  type Task,
  type TeamSummary,
  type TimeEntry,
} from "./types.js";

// Every test gets a fresh, empty in-memory database, with one account ("Ada") logged in.
let app: FastifyInstance;
// Ada's login cookie, sent by inject() below.
let cookie: string;

beforeEach(async () => {
  app = buildApp({ databaseUrl: ":memory:" });
  cookie = (await signUp("Ada", "ada@example.com")).cookie;
});

afterEach(async () => {
  await app.close();
});

/** Like app.inject(), but logged in as Ada (pass other headers to act as someone else). */
function inject(options: InjectOptions) {
  return app.inject({ ...options, headers: { cookie, ...options.headers } });
}

/** "dosprout_session=abc" from a response's Set-Cookie header. */
function cookieFrom(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : String(header);
  return first.split(";")[0];
}

const PASSWORD = "correct horse battery";

/** Creates an account. Returns its login cookie and what the API says about it. */
async function signUp(name: string, email: string, extra: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { name, email, password: PASSWORD, ...extra },
  });
  assert.equal(response.statusCode, 201, response.body);
  return { cookie: cookieFrom(response), me: response.json() as Me };
}

async function createTask(body: Record<string, unknown>): Promise<Task> {
  const response = await inject({ method: "POST", url: "/api/tasks", payload: body });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

describe("tasks API", () => {
  test("health check responds", async () => {
    const response = await inject({ method: "GET", url: "/api/health" });
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

    const response = await inject({ method: "GET", url: "/api/tasks" });
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
      const response = await inject({ method: "POST", url: "/api/tasks", payload });
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
    const created = await inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "x", startAt: "2026-11-17T12:00:00Z", dueAt: "2026-11-17T11:59:00Z" },
    });
    assert.equal(created.statusCode, 400);
    assert.match(created.json().message, /due date/);

    // Also when only one of the two dates changes.
    const task = await createTask({ title: "y", startAt: "2026-11-17T12:00:00Z" });
    const updated = await inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { dueAt: "2026-11-16T12:00:00Z" },
    });
    assert.equal(updated.statusCode, 400);

    // Same start and due time is fine.
    const same = await inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { dueAt: "2026-11-17T12:00:00Z" },
    });
    assert.equal(same.statusCode, 200);
  });

  test("updates a task and moves it to the end of its new column", async () => {
    await createTask({ title: "Already done", status: "done" });
    const task = await createTask({ title: "Write report" });

    const response = await inject({
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
      const response = await inject({ method, url, payload: { title: "x" } });
      assert.equal(response.statusCode, 404, `${method} ${url}`);
    }
  });

  test("deletes a task together with its subtasks", async () => {
    const task = await createTask({ title: "Temp", subtasks: ["a"] });
    const response = await inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
    assert.equal(response.statusCode, 204);
    const list = await inject({ method: "GET", url: "/api/tasks" });
    assert.deepEqual(list.json(), []);
  });

  test("adds, toggles, renames and deletes subtasks", async () => {
    const task = await createTask({ title: "Plan trip" });

    const added = await inject({
      method: "POST",
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: "Book flights" },
    });
    assert.equal(added.statusCode, 201);
    const subtaskId = (added.json() as Task).subtasks[0].id;
    const subtaskUrl = `/api/tasks/${task.id}/subtasks/${subtaskId}`;

    const toggled = await inject({
      method: "PATCH",
      url: subtaskUrl,
      payload: { done: true, title: "Book cheap flights" },
    });
    assert.deepEqual(
      (toggled.json() as Task).subtasks.map((s) => [s.title, s.done]),
      [["Book cheap flights", true]],
    );

    const deleted = await inject({ method: "DELETE", url: subtaskUrl });
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual((deleted.json() as Task).subtasks, []);

    const missing = await inject({ method: "DELETE", url: subtaskUrl });
    assert.equal(missing.statusCode, 404);
  });

  test("ticking subtasks moves the task to in progress, then done", async () => {
    const task = await createTask({ title: "Move house", subtasks: ["Pack", "Drive"] });
    const [pack, drive] = task.subtasks;
    const tick = async (subtaskId: number, done: boolean) => {
      const response = await inject({
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
    const added = await inject({
      method: "POST",
      url: `/api/tasks/${task.id}/subtasks`,
      payload: { title: "Unpack" },
    });
    assert.equal((added.json() as Task).status, "in_progress");

    // Deleting the only unfinished subtask finishes it.
    const unpack = (added.json() as Task).subtasks.at(-1)!;
    const deleted = await inject({
      method: "DELETE",
      url: `/api/tasks/${task.id}/subtasks/${unpack.id}`,
    });
    assert.equal((deleted.json() as Task).status, "done");
  });

  test("unticking the only subtask of a done task moves it back to to do", async () => {
    const task = await createTask({ title: "Call mum", subtasks: ["Call"] });
    const url = `/api/tasks/${task.id}/subtasks/${task.subtasks[0].id}`;
    await inject({ method: "PATCH", url, payload: { done: true } });
    const response = await inject({ method: "PATCH", url, payload: { done: false } });
    assert.equal((response.json() as Task).status, "todo");
  });

  test("a task with unfinished subtasks can't be marked done", async () => {
    const task = await createTask({ title: "Launch", subtasks: ["Build", "Ship"] });
    const url = `/api/tasks/${task.id}`;

    const blocked = await inject({ method: "PATCH", url, payload: { status: "done" } });
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.json().message, /unfinished subtasks/);
    const unchanged = await inject({ method: "GET", url });
    assert.equal((unchanged.json() as Task).status, "todo");

    // Creating it as done straight away is blocked too (new subtasks start unfinished)...
    const created = await inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Too soon", status: "done", subtasks: ["Step"] },
    });
    assert.equal(created.statusCode, 400);
    // ...but a task without subtasks can be.
    assert.equal((await createTask({ title: "Simple", status: "done" })).status, "done");

    // Once every subtask is ticked it's done, and it can go back and forth after that.
    for (const subtask of task.subtasks) {
      await inject({ method: "PATCH", url: `${url}/subtasks/${subtask.id}`, payload: { done: true } });
    }
    await inject({ method: "PATCH", url, payload: { status: "in_progress" } });
    const done = await inject({ method: "PATCH", url, payload: { status: "done" } });
    assert.equal(done.statusCode, 200);
  });

  test("remembers when a task was completed", async () => {
    const task = await createTask({ title: "Water plants" });
    assert.equal(task.completedAt, null);
    const patch = async (payload: object, url = `/api/tasks/${task.id}`) =>
      (await inject({ method: "PATCH", url, payload })).json() as Task;

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
    const response = await inject({
      method: "PATCH",
      url: `/api/tasks/${second.id}/subtasks/${first.subtasks[0].id}`,
      payload: { done: true },
    });
    assert.equal(response.statusCode, 404);
  });
});

describe("goals API", () => {
  async function createGoal(body: Record<string, unknown>): Promise<Goal> {
    const response = await inject({ method: "POST", url: "/api/goals", payload: body });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  test("creates, lists, updates and deletes goals", async () => {
    const goal = await createGoal({ title: "  Get fit  ", targetDate: "2026-12-31" });
    assert.equal(goal.title, "Get fit");
    assert.equal(goal.description, "");
    assert.equal(goal.color, "blue");
    assert.equal(goal.targetDate, "2026-12-31");

    const list = await inject({ method: "GET", url: "/api/goals" });
    assert.deepEqual(
      (list.json() as Goal[]).map((g) => g.title),
      ["Get fit"],
    );

    const url = `/api/goals/${goal.id}`;
    const updated = await inject({
      method: "PATCH",
      url,
      payload: { color: "aqua", description: "Run 5k", targetDate: null },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(
      [(updated.json() as Goal).color, (updated.json() as Goal).description, (updated.json() as Goal).targetDate],
      ["aqua", "Run 5k", null],
    );

    const deleted = await inject({ method: "DELETE", url });
    assert.equal(deleted.statusCode, 204);
    assert.equal((await inject({ method: "GET", url })).statusCode, 404);
  });

  test("rejects invalid goals", async () => {
    for (const payload of [
      {},
      { title: "   " },
      { title: "x", color: "rainbow" },
      { title: "x", targetDate: "next week" },
      { title: "x", targetDate: "2026-12-31T10:00:00Z" },
    ]) {
      const response = await inject({ method: "POST", url: "/api/goals", payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
  });

  test("tasks can belong to a goal, and deleting the goal keeps its tasks", async () => {
    const goal = await createGoal({ title: "Move house" });
    const task = await createTask({ title: "Pack boxes", goalId: goal.id });
    assert.equal(task.goalId, goal.id);

    // Unlink and link again with PATCH.
    const unlinked = await inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: null } });
    assert.equal((unlinked.json() as Task).goalId, null);
    await inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: goal.id } });

    await inject({ method: "DELETE", url: `/api/goals/${goal.id}` });
    const after = await inject({ method: "GET", url: `/api/tasks/${task.id}` });
    assert.equal(after.statusCode, 200, "the task still exists");
    assert.equal((after.json() as Task).goalId, null, "and no longer points at the deleted goal");
  });

  test("a task can't point at a goal that doesn't exist", async () => {
    const created = await inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Orphan", goalId: 999 },
    });
    assert.equal(created.statusCode, 400);
    assert.match(created.json().message, /goal doesn't exist/);

    const task = await createTask({ title: "Plain" });
    const patched = await inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: 999 } });
    assert.equal(patched.statusCode, 400);
  });
});

describe("time tracking API", () => {
  const post = async (url: string, payload?: object) =>
    inject({ method: "POST", url, ...(payload ? { payload } : {}) });

  test("starts and stops a timer; starting another stops the first", async () => {
    const task = await createTask({ title: "Write report" });

    const first = await post("/api/time-entries/start", { taskId: task.id });
    assert.equal(first.statusCode, 201);
    const running = first.json() as TimeEntry;
    assert.equal(running.taskId, task.id);
    assert.equal(running.kind, "timer");
    assert.equal(running.endedAt, null, "a running timer has no end yet");

    // A focus session on no task: the first timer gets stopped.
    const second = (await post("/api/time-entries/start", { kind: "focus" })).json() as TimeEntry;
    assert.equal(second.kind, "focus");
    const list = (await inject({ method: "GET", url: "/api/time-entries" })).json() as TimeEntry[];
    assert.equal(list.filter((entry) => entry.endedAt === null).length, 1, "only one timer runs");
    assert.ok(list.find((entry) => entry.id === running.id)?.endedAt);

    const stopped = await post("/api/time-entries/stop");
    assert.equal(stopped.statusCode, 200);
    assert.equal((stopped.json() as TimeEntry).id, second.id);
    assert.ok((stopped.json() as TimeEntry).endedAt);
    assert.equal((await post("/api/time-entries/stop")).statusCode, 404, "nothing left to stop");
  });

  test("adds, edits and deletes time by hand, and checks the times", async () => {
    const task = await createTask({ title: "Read book" });
    const created = await post("/api/time-entries", {
      taskId: task.id,
      startedAt: "2026-09-01T10:00:00+01:00",
      endedAt: "2026-09-01T10:45:00+01:00",
      note: " Chapter 3 ",
    });
    assert.equal(created.statusCode, 201);
    const entry = created.json() as TimeEntry;
    assert.deepEqual(
      [entry.kind, entry.startedAt, entry.endedAt, entry.note],
      ["manual", "2026-09-01T09:00:00.000Z", "2026-09-01T09:45:00.000Z", "Chapter 3"],
    );

    // The end has to come after the start (also after an edit).
    const backwards = await post("/api/time-entries", {
      startedAt: "2026-09-01T11:00:00Z",
      endedAt: "2026-09-01T10:00:00Z",
    });
    assert.equal(backwards.statusCode, 400);
    const url = `/api/time-entries/${entry.id}`;
    const badEdit = await inject({ method: "PATCH", url, payload: { endedAt: "2026-09-01T08:00:00Z" } });
    assert.equal(badEdit.statusCode, 400);

    const edited = await inject({ method: "PATCH", url, payload: { note: "Chapters 3-4", taskId: null } });
    assert.deepEqual(
      [(edited.json() as TimeEntry).note, (edited.json() as TimeEntry).taskId],
      ["Chapters 3-4", null],
    );

    assert.equal((await inject({ method: "DELETE", url })).statusCode, 204);
    assert.equal((await inject({ method: "DELETE", url })).statusCode, 404);
  });

  test("time can only be tracked on tasks that exist, and goes when its task is deleted", async () => {
    assert.equal((await post("/api/time-entries/start", { taskId: 999 })).statusCode, 400);

    const task = await createTask({ title: "Temp" });
    await post("/api/time-entries/start", { taskId: task.id });
    await inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
    const list = (await inject({ method: "GET", url: "/api/time-entries" })).json() as TimeEntry[];
    assert.equal(list.length, 0);
  });

  test("tasks can have an estimate", async () => {
    const task = await createTask({ title: "Paint fence", estimateMinutes: 90 });
    assert.equal(task.estimateMinutes, 90);
    const cleared = await inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { estimateMinutes: null },
    });
    assert.equal((cleared.json() as Task).estimateMinutes, null);
    const invalid = await inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { estimateMinutes: 12.5 },
    });
    assert.equal(invalid.statusCode, 400);
  });
});

describe("settings and backups API", () => {
  test("settings start with defaults and can be changed one at a time", async () => {
    const initial = (await inject({ method: "GET", url: "/api/settings" })).json() as Settings;
    assert.deepEqual(initial, DEFAULT_SETTINGS);

    const changed = await inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { theme: "dark", focusMinutes: 50, timerSounds: false, notifications: { dueSoon: false } },
    });
    assert.equal(changed.statusCode, 200);
    const settings = changed.json() as Settings;
    assert.equal(settings.theme, "dark");
    assert.equal(settings.focusMinutes, 50);
    assert.equal(settings.timerSounds, false);
    // Only dueSoon changed; the other notification kinds stay on.
    assert.deepEqual(settings.notifications, { started: true, dueSoon: false, done: true, focus: true });
    assert.equal(settings.breakMinutes, 5);

    const again = (await inject({ method: "GET", url: "/api/settings" })).json() as Settings;
    assert.deepEqual(again, settings, "saved");
  });

  test("rejects invalid settings", async () => {
    for (const payload of [
      {},
      { theme: "blue" },
      { focusMinutes: 2 },
      { weekStartsOn: 3 },
      { timerSounds: "loud" },
      { defaultDueTime: "5pm" },
      { tagSuggestions: ["Work", "Work"] },
    ]) {
      const response = await inject({ method: "PATCH", url: "/api/settings", payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
  });

  test("exports everything and imports it back exactly", async () => {
    const goal = (await inject({ method: "POST", url: "/api/goals", payload: { title: "Ship it" } })).json() as Goal;
    const task = await createTask({ title: "Write docs", goalId: goal.id, subtasks: ["Intro"], estimateMinutes: 60 });
    await inject({
      method: "POST",
      url: "/api/time-entries",
      payload: { taskId: task.id, startedAt: "2026-09-01T09:00:00Z", endedAt: "2026-09-01T10:00:00Z" },
    });
    await inject({ method: "PATCH", url: "/api/settings", payload: { weekStartsOn: 0 } });

    const exported = (await inject({ method: "GET", url: "/api/export" })).json() as Backup;
    assert.equal(exported.app, "DoSprout");
    assert.equal(exported.tasks.length, 1);

    // Wipe everything, then restore it.
    assert.equal((await inject({ method: "DELETE", url: "/api/data" })).statusCode, 204);
    assert.deepEqual((await inject({ method: "GET", url: "/api/tasks" })).json(), []);
    const imported = await inject({ method: "POST", url: "/api/import", payload: exported });
    assert.equal(imported.statusCode, 200, imported.body);

    // Everything is back, with new ids (other teams share the tables) and the links intact.
    const again = (await inject({ method: "GET", url: "/api/export" })).json() as Backup;
    assert.deepEqual(again.settings, exported.settings);
    assert.equal(again.tasks.length, 1);
    const [restored] = again.tasks;
    assert.equal(restored.title, "Write docs");
    assert.equal(restored.estimateMinutes, 60);
    assert.deepEqual(restored.subtasks.map((s) => s.title), ["Intro"]);
    assert.equal(again.goals.find((g) => g.id === restored.goalId)?.title, "Ship it");
    assert.equal(again.timeEntries.length, 1);
    assert.equal(again.timeEntries[0].taskId, restored.id);
    assert.equal(again.timeEntries[0].startedAt, "2026-09-01T09:00:00.000Z");
  });

  test("refuses a damaged backup and changes nothing", async () => {
    await createTask({ title: "Keep me" });
    const damaged = {
      app: "DoSprout",
      version: 1,
      goals: [],
      tasks: [],
      timeEntries: [
        { id: 1, taskId: 5, kind: "timer", startedAt: "2026-09-01T09:00:00Z", endedAt: null, note: "", createdAt: "2026-09-01T09:00:00Z" },
      ],
    };
    const response = await inject({ method: "POST", url: "/api/import", payload: damaged });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /damaged/);
    const notABackup = await inject({ method: "POST", url: "/api/import", payload: { hello: "world" } });
    assert.equal(notABackup.statusCode, 400);

    const tasks = (await inject({ method: "GET", url: "/api/tasks" })).json() as Task[];
    assert.deepEqual(tasks.map((t) => t.title), ["Keep me"]);
  });

  test("deleting all data keeps the settings", async () => {
    await createTask({ title: "Gone soon" });
    await inject({ method: "PATCH", url: "/api/settings", payload: { theme: "light" } });
    await inject({ method: "DELETE", url: "/api/data" });
    assert.deepEqual((await inject({ method: "GET", url: "/api/tasks" })).json(), []);
    assert.equal(((await inject({ method: "GET", url: "/api/settings" })).json() as Settings).theme, "light");
  });
});

describe("copying tasks to another database", () => {
  test("copies every task and subtask exactly, and refuses to overwrite unless asked", async () => {
    const from = await openDatabase({ url: ":memory:" });
    const to = await openDatabase({ url: ":memory:" });
    // Team 1 in the source gets the example data plus one more task.
    await from.batch(exampleDataStatements(1, 1), "write");
    const fromStore = new TaskStore(from, 1);
    await fromStore.create({ title: "Only in the source", subtasks: ["x"] });

    // The target has a task, so it isn't empty.
    await new TaskStore(to, 1).create({ title: "Already in the target" });
    await assert.rejects(copyTasks(from, to), TargetNotEmptyError);

    const result = await copyTasks(from, to, { replace: true });
    assert.equal(result.tasks, 6);
    const toStore = new TaskStore(to, 1);
    assert.deepEqual(await toStore.list(), await fromStore.list());
    // Goals come along too (the example data has one, linked to three tasks).
    assert.equal(result.goals, 1);
    assert.equal(result.timeEntries, 3, "and the example tracked time");
    assert.deepEqual(await new GoalStore(to, 1).list(), await new GoalStore(from, 1).list());

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

      const db = await openDatabase({ url: `file:${path}` });
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

describe("accounts", () => {
  test("signing up logs you in and gives you a personal team", async () => {
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    assert.equal(me.user.name, "Ada");
    assert.equal(me.user.email, "ada@example.com");
    assert.equal("passwordHash" in me.user, false, "the password hash is never sent");
    assert.deepEqual(
      me.teams.map((t) => [t.name, t.personal, t.role]),
      [["Personal", true, "owner"]],
    );
  });

  test("everything except signing up and logging in needs a login", async () => {
    for (const url of ["/api/tasks", "/api/goals", "/api/time-entries", "/api/settings", "/api/auth/me"]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 401, url);
    }
    const fake = await app.inject({ method: "GET", url: "/api/tasks", headers: { cookie: "dosprout_session=made-up" } });
    assert.equal(fake.statusCode, 401);
  });

  test("checks sign-up details, and an email can only be used once", async () => {
    for (const payload of [
      { name: "X", email: "not-an-email", password: PASSWORD },
      { name: "X", email: "x@example.com", password: "short" },
      { name: " ", email: "x@example.com", password: PASSWORD },
      { email: "x@example.com", password: PASSWORD },
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/auth/signup", payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
    // Capitals and spaces don't make it a different address.
    const again = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { name: "Ada 2", email: " ADA@example.com ", password: PASSWORD },
    });
    assert.equal(again.statusCode, 409);
  });

  test("logs in with the right password only, and logs out", async () => {
    const login = (password: string) =>
      app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "Ada@Example.com", password } });

    const wrong = await login("wrong password");
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.json().message, "Wrong email or password.");
    assert.equal((await app.inject({
      method: "POST", url: "/api/auth/login", payload: { email: "nobody@example.com", password: PASSWORD },
    })).statusCode, 401);

    const right = await login(PASSWORD);
    assert.equal(right.statusCode, 200);
    const session = cookieFrom(right);
    assert.match(String(right.headers["set-cookie"]), /HttpOnly/);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: session } });
    assert.equal((me.json() as Me).user.name, "Ada");

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: session } });
    assert.equal(logout.statusCode, 204);
    const after = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: session } });
    assert.equal(after.statusCode, 401, "the old login no longer works");
  });

  test("each person's personal tasks and settings are their own", async () => {
    await createTask({ title: "Ada's secret" });
    await inject({ method: "PATCH", url: "/api/settings", payload: { theme: "dark" } });

    const bob = await signUp("Bob", "bob@example.com");
    const asBob = (options: InjectOptions) =>
      app.inject({ ...options, headers: { cookie: bob.cookie, ...options.headers } });
    assert.deepEqual((await asBob({ method: "GET", url: "/api/tasks" })).json(), []);
    assert.equal(((await asBob({ method: "GET", url: "/api/settings" })).json() as Settings).theme, "system");

    // Bob can't reach Ada's task by its id either.
    const [adaTask] = (await inject({ method: "GET", url: "/api/tasks" })).json() as Task[];
    assert.equal((await asBob({ method: "GET", url: `/api/tasks/${adaTask.id}` })).statusCode, 404);
    assert.equal((await asBob({ method: "DELETE", url: `/api/tasks/${adaTask.id}` })).statusCode, 404);
    // ...or by asking for her personal team.
    const adaTeam = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    const sneaky = await asBob({ method: "GET", url: "/api/tasks", headers: { "x-team-id": String(adaTeam.teams[0].id) } });
    assert.equal(sneaky.statusCode, 404);
  });

  test("new accounts get example tasks when seeding is on", async () => {
    const seeded = buildApp({ databaseUrl: ":memory:", seed: true });
    try {
      for (const email of ["one@example.com", "two@example.com"]) {
        const signup = await seeded.inject({
          method: "POST",
          url: "/api/auth/signup",
          payload: { name: "Someone", email, password: PASSWORD },
        });
        const headers = { cookie: cookieFrom(signup) };
        const tasks = (await seeded.inject({ method: "GET", url: "/api/tasks", headers })).json() as Task[];
        const goals = (await seeded.inject({ method: "GET", url: "/api/goals", headers })).json() as Goal[];
        const time = (await seeded.inject({ method: "GET", url: "/api/time-entries", headers })).json() as TimeEntry[];
        assert.equal(tasks.length, 5, email);
        assert.equal(goals.length, 1);
        assert.equal(tasks.filter((t) => t.goalId === goals[0].id).length, 3, "three tasks belong to the goal");
        assert.equal(time.length, 3);
        assert.ok(time.every((entry) => tasks.some((t) => t.id === entry.taskId)));
        assert.equal(tasks.find((t) => t.title === "Do back exercises")?.subtasks.length, 3);
      }
    } finally {
      await seeded.close();
    }
  });

  test("the first person to sign up takes over the data from before accounts existed", async () => {
    const folder = mkdtempSync(join(tmpdir(), "todo-test-"));
    const url = `file:${join(folder, "old.db")}`;
    try {
      // Data made before accounts: no team, and the old shared settings row.
      const db = await openDatabase({ url });
      await db.batch(
        [
          "INSERT INTO goals (title) VALUES ('Old goal')",
          "INSERT INTO tasks (title, goal_id) VALUES ('Old task', (SELECT MAX(id) FROM goals))",
          "INSERT INTO time_entries (task_id, started_at, ended_at) VALUES ((SELECT MAX(id) FROM tasks), '2026-09-01T09:00:00.000Z', '2026-09-01T10:00:00.000Z')",
          `INSERT INTO settings (id, data) VALUES (1, '{"theme":"dark"}')`,
        ],
        "write",
      );
      db.close();

      const old = buildApp({ databaseUrl: url, seed: true });
      try {
        const first = await old.inject({ method: "POST", url: "/api/auth/signup", payload: { name: "First", email: "first@example.com", password: PASSWORD } });
        const headers = { cookie: cookieFrom(first) };
        const tasks = (await old.inject({ method: "GET", url: "/api/tasks", headers })).json() as Task[];
        assert.deepEqual(tasks.map((t) => t.title), ["Old task"], "no examples: the old data is theirs");
        assert.equal(((await old.inject({ method: "GET", url: "/api/goals", headers })).json() as Goal[]).length, 1);
        assert.equal(((await old.inject({ method: "GET", url: "/api/time-entries", headers })).json() as TimeEntry[]).length, 1);
        assert.equal(((await old.inject({ method: "GET", url: "/api/settings", headers })).json() as Settings).theme, "dark");

        const second = await old.inject({ method: "POST", url: "/api/auth/signup", payload: { name: "Second", email: "second@example.com", password: PASSWORD } });
        const secondHeaders = { cookie: cookieFrom(second) };
        const theirs = (await old.inject({ method: "GET", url: "/api/tasks", headers: secondHeaders })).json() as Task[];
        assert.ok(!theirs.some((t) => t.title === "Old task"), "the second person gets examples, not the old data");
        assert.equal(((await old.inject({ method: "GET", url: "/api/settings", headers: secondHeaders })).json() as Settings).theme, "system");
      } finally {
        await old.close();
      }
    } finally {
      try {
        rmSync(folder, { recursive: true, force: true });
      } catch {
        // Windows keeps the file locked until the test process ends; it's in the temp folder anyway.
      }
    }
  });
});

describe("teams", () => {
  /** Ada creates a team; returns it. */
  async function createTeam(name = "Marketing"): Promise<TeamSummary> {
    const response = await inject({ method: "POST", url: "/api/teams", payload: { name } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  /** Ada invites an email address to a team. */
  async function invite(teamId: number, email: string): Promise<Invite> {
    const response = await inject({ method: "POST", url: `/api/teams/${teamId}/invites`, payload: { email } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  /** Ada creates a team and invites Bob, who signs up through the invite. */
  async function teamWithBob() {
    const team = await createTeam();
    const { token } = await invite(team.id, "bob@example.com");
    const bob = await signUp("Bob", "bob@example.com", { inviteToken: token });
    const bobId = bob.me.user.id;
    // Requests about the team send its id in the X-Team-Id header, like the website does.
    const asAda = (options: InjectOptions) =>
      inject({ ...options, headers: { "x-team-id": String(team.id), ...options.headers } });
    const asBob = (options: InjectOptions) =>
      app.inject({ ...options, headers: { cookie: bob.cookie, "x-team-id": String(team.id), ...options.headers } });
    return { team, bob, bobId, asAda, asBob };
  }

  test("creating a team makes you its owner", async () => {
    const team = await createTeam("  Marketing  ");
    assert.deepEqual([team.name, team.personal, team.role], ["Marketing", false, "owner"]);
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    assert.deepEqual(me.teams.map((t) => t.name), ["Personal", "Marketing"], "personal team first");
  });

  test("invites: preview the link, sign up with it and you're in the team", async () => {
    const team = await createTeam();
    const sent = await invite(team.id, " Bob@Example.com ");
    assert.equal(sent.email, "bob@example.com");
    assert.equal(sent.invitedBy, "Ada");

    // Anyone with the link can see what it's for, without logging in.
    const preview = await app.inject({ method: "GET", url: `/api/invites/${sent.token}` });
    assert.deepEqual(
      { ...(preview.json() as InvitePreview), expiresAt: undefined },
      { kind: "team", name: "Marketing", email: "bob@example.com", invitedBy: "Ada", expiresAt: undefined },
    );

    // The invite only works for the address it was sent to.
    const wrongPerson = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { name: "Eve", email: "eve@example.com", password: PASSWORD, inviteToken: sent.token },
    });
    assert.equal(wrongPerson.statusCode, 400);
    assert.match(wrongPerson.json().message, /bob@example.com/);

    const bob = await signUp("Bob", "bob@example.com", { inviteToken: sent.token });
    assert.deepEqual(bob.me.teams.map((t) => [t.name, t.role]), [["Personal", "owner"], ["Marketing", "member"]]);

    // The link is used up.
    assert.equal((await app.inject({ method: "GET", url: `/api/invites/${sent.token}` })).statusCode, 404);
    const members = (await inject({ method: "GET", url: `/api/teams/${team.id}/members` })).json() as Member[];
    assert.deepEqual(members.map((m) => [m.name, m.role]), [["Ada", "owner"], ["Bob", "member"]]);
  });

  test("someone who already has an account accepts an invite while logged in", async () => {
    const team = await createTeam();
    const bob = await signUp("Bob", "bob@example.com");
    const eve = await signUp("Eve", "eve@example.com");
    const { token } = await invite(team.id, "bob@example.com");

    const asEve = await app.inject({ method: "POST", url: `/api/invites/${token}/accept`, headers: { cookie: eve.cookie } });
    assert.equal(asEve.statusCode, 403, "Eve can't use Bob's invite");
    const notLoggedIn = await app.inject({ method: "POST", url: `/api/invites/${token}/accept` });
    assert.equal(notLoggedIn.statusCode, 401);

    const accepted = await app.inject({ method: "POST", url: `/api/invites/${token}/accept`, headers: { cookie: bob.cookie } });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal((accepted.json() as AcceptedInvite).kind, "team");
    const bobsTeams = (await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: bob.cookie } })).json() as Me;
    assert.equal(bobsTeams.teams.find((t) => t.id === team.id)?.role, "member");
  });

  test("only the owner manages invites, and nobody shares a personal team", async () => {
    const { team, asBob } = await teamWithBob();
    const bobInvites = await asBob({ method: "POST", url: `/api/teams/${team.id}/invites`, payload: { email: "eve@example.com" } });
    assert.equal(bobInvites.statusCode, 403);
    assert.equal((await asBob({ method: "GET", url: `/api/teams/${team.id}/invites` })).statusCode, 403);

    const already = await inject({ method: "POST", url: `/api/teams/${team.id}/invites`, payload: { email: "bob@example.com" } });
    assert.equal(already.statusCode, 409, "Bob is already in");

    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    const personal = me.teams.find((t) => t.personal)!;
    const sharePersonal = await inject({ method: "POST", url: `/api/teams/${personal.id}/invites`, payload: { email: "eve@example.com" } });
    assert.equal(sharePersonal.statusCode, 400);

    // Inviting the same address twice keeps one invite; it can be cancelled.
    await invite(team.id, "eve@example.com");
    const second = await invite(team.id, "eve@example.com");
    const pending = (await inject({ method: "GET", url: `/api/teams/${team.id}/invites` })).json() as Invite[];
    assert.deepEqual(pending.map((i) => i.id), [second.id]);
    assert.equal((await inject({ method: "DELETE", url: `/api/teams/${team.id}/invites/${second.id}` })).statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url: `/api/invites/${second.token}` })).statusCode, 404);
  });

  test("team members share tasks and goals, and tasks can be assigned to them", async () => {
    const { bobId, asAda, asBob } = await teamWithBob();

    const goal = (await asAda({ method: "POST", url: "/api/goals", payload: { title: "Launch campaign" } })).json() as Goal;
    const created = await asAda({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Write the ad", goalId: goal.id, assigneeId: bobId },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal((created.json() as Task).assigneeId, bobId);

    // Bob sees the team's task and goal...
    const bobTasks = (await asBob({ method: "GET", url: "/api/tasks" })).json() as Task[];
    assert.deepEqual(bobTasks.map((t) => [t.title, t.assigneeId]), [["Write the ad", bobId]]);
    assert.deepEqual(((await asBob({ method: "GET", url: "/api/goals" })).json() as Goal[]).map((g) => g.title), ["Launch campaign"]);
    // ...but the team's tasks aren't in Ada's personal list.
    assert.deepEqual((await inject({ method: "GET", url: "/api/tasks" })).json(), []);

    // Only team members can be assigned, and goals must be the team's own.
    const outsider = await signUp("Eve", "eve@example.com");
    const task = created.json() as Task;
    const assignEve = await asBob({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { assigneeId: outsider.me.user.id } });
    assert.equal(assignEve.statusCode, 400);
    const personalGoal = (await inject({ method: "POST", url: "/api/goals", payload: { title: "Ada's own" } })).json() as Goal;
    const wrongGoal = await asBob({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { goalId: personalGoal.id } });
    assert.equal(wrongGoal.statusCode, 400);
    const unassign = await asBob({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { assigneeId: null } });
    assert.equal((unassign.json() as Task).assigneeId, null);
  });

  test("tracked time is personal, even in a team", async () => {
    const { asAda, asBob } = await teamWithBob();
    const task = (await asAda({ method: "POST", url: "/api/tasks", payload: { title: "Shared" } })).json() as Task;

    await asAda({ method: "POST", url: "/api/time-entries/start", payload: { taskId: task.id } });
    await asBob({ method: "POST", url: "/api/time-entries/start", payload: { taskId: task.id } });
    const adaTime = (await asAda({ method: "GET", url: "/api/time-entries" })).json() as TimeEntry[];
    const bobTime = (await asBob({ method: "GET", url: "/api/time-entries" })).json() as TimeEntry[];
    assert.equal(adaTime.length, 1);
    assert.equal(bobTime.length, 1);
    assert.equal(adaTime[0].endedAt, null, "Bob starting his timer doesn't stop Ada's");

    // Bob can't change Ada's entry.
    assert.equal((await asBob({ method: "DELETE", url: `/api/time-entries/${adaTime[0].id}` })).statusCode, 404);
    // A new timer stops your own running one, even in another team.
    await inject({ method: "POST", url: "/api/time-entries/start", payload: {} });
    const adaAfter = (await asAda({ method: "GET", url: "/api/time-entries" })).json() as TimeEntry[];
    assert.ok(adaAfter[0].endedAt);
  });

  test("members can leave, the owner can remove them, and their tasks become unassigned", async () => {
    const { team, bobId, asAda, asBob } = await teamWithBob();
    const task = (await asAda({ method: "POST", url: "/api/tasks", payload: { title: "Bob's job", assigneeId: bobId } })).json() as Task;

    // Bob can't remove Ada, and Ada (the owner) can't leave.
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    assert.equal((await asBob({ method: "DELETE", url: `/api/teams/${team.id}/members/${me.user.id}` })).statusCode, 403);
    assert.equal((await asAda({ method: "DELETE", url: `/api/teams/${team.id}/members/${me.user.id}` })).statusCode, 400);

    assert.equal((await asAda({ method: "DELETE", url: `/api/teams/${team.id}/members/${bobId}` })).statusCode, 204);
    assert.equal(((await asAda({ method: "GET", url: `/api/tasks/${task.id}` })).json() as Task).assigneeId, null);
    // Bob is out: the team's tasks are gone for him.
    assert.equal((await asBob({ method: "GET", url: "/api/tasks" })).statusCode, 404);
  });

  test("only the owner renames or deletes a team, or replaces its data", async () => {
    const { team, asAda, asBob } = await teamWithBob();
    await asAda({ method: "POST", url: "/api/tasks", payload: { title: "Team task" } });

    assert.equal((await asBob({ method: "PATCH", url: `/api/teams/${team.id}`, payload: { name: "Hijacked" } })).statusCode, 403);
    assert.equal((await asBob({ method: "DELETE", url: "/api/data" })).statusCode, 403);
    assert.equal((await asBob({ method: "DELETE", url: `/api/teams/${team.id}` })).statusCode, 403);

    const renamed = await asAda({ method: "PATCH", url: `/api/teams/${team.id}`, payload: { name: "Growth" } });
    assert.equal((renamed.json() as TeamSummary).name, "Growth");

    assert.equal((await asAda({ method: "DELETE", url: `/api/teams/${team.id}` })).statusCode, 204);
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    assert.deepEqual(me.teams.map((t) => t.name), ["Personal"]);
    assert.equal((await asBob({ method: "GET", url: "/api/tasks" })).statusCode, 404);
  });

  test("my work: your personal tasks plus what's assigned to you in every team", async () => {
    const { team, bobId, asAda, asBob } = await teamWithBob();
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    const adaId = me.user.id;

    await createTask({ title: "Ada's personal task" });
    const goal = (await asAda({ method: "POST", url: "/api/goals", payload: { title: "Launch" } })).json() as Goal;
    await asAda({ method: "POST", url: "/api/tasks", payload: { title: "For Ada", assigneeId: adaId, goalId: goal.id } });
    await asAda({ method: "POST", url: "/api/tasks", payload: { title: "For Bob", assigneeId: bobId } });
    await asAda({ method: "POST", url: "/api/tasks", payload: { title: "Nobody's" } });

    const response = await inject({ method: "GET", url: "/api/my-work" });
    assert.equal(response.statusCode, 200, response.body);
    const groups = response.json() as MyWorkGroup[];
    assert.deepEqual(
      groups.map((g) => [g.team.name, g.tasks.map((t) => t.title)]),
      [
        ["Personal", ["Ada's personal task"]],
        ["Marketing", ["For Ada"]],
      ],
    );
    // The team's goals come along, so the page can show the task's goal.
    assert.deepEqual(groups[1].goals.map((g) => g.title), ["Launch"]);
    assert.equal(groups[1].team.id, team.id);

    // Bob only gets his own: his (empty) personal team and "For Bob".
    const bobs = (await asBob({ method: "GET", url: "/api/my-work" })).json() as MyWorkGroup[];
    assert.deepEqual(bobs.map((g) => g.tasks.map((t) => t.title)), [[], ["For Bob"]]);

    assert.equal((await app.inject({ method: "GET", url: "/api/my-work" })).statusCode, 401);
  });
});

describe("organizations", () => {
  /** Acting as someone else: their cookie (plus any other headers). */
  const as = (personCookie: string) => (options: InjectOptions) =>
    app.inject({ ...options, headers: { cookie: personCookie, ...options.headers } });

  /** Ada creates an organization; returns it. */
  async function createOrganization(name = "Acme"): Promise<OrganizationSummary> {
    const response = await inject({ method: "POST", url: "/api/organizations", payload: { name } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  /** Ada creates a team (on its own, or in an organization). */
  async function createTeam(name: string, organizationId: number | null = null): Promise<TeamSummary> {
    const response = await inject({ method: "POST", url: "/api/teams", payload: { name, organizationId } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }

  /** Ada creates "Acme" and invites Bob to it; Bob signs up through the link. */
  async function organizationWithBob() {
    const organization = await createOrganization();
    const sent = await inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/invites`,
      payload: { email: "bob@example.com" },
    });
    assert.equal(sent.statusCode, 201, sent.body);
    const bob = await signUp("Bob", "bob@example.com", { inviteToken: (sent.json() as OrganizationInvite).token });
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    return { organization, bob, bobId: bob.me.user.id, adaId: me.user.id, asBob: as(bob.cookie) };
  }

  const myself = async (personCookie = cookie) =>
    (await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: personCookie } })).json() as Me;

  test("creating an organization makes you its admin", async () => {
    const organization = await createOrganization("  Acme  ");
    assert.deepEqual([organization.name, organization.role], ["Acme", "admin"]);
    assert.deepEqual((await myself()).organizations.map((o) => [o.name, o.role]), [["Acme", "admin"]]);
  });

  test("an organization invite link: preview it, sign up with it, and you're a member", async () => {
    const organization = await createOrganization();
    const sent = (await inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/invites`,
      payload: { email: "bob@example.com" },
    })).json() as OrganizationInvite;

    const preview = (await app.inject({ method: "GET", url: `/api/invites/${sent.token}` })).json() as InvitePreview;
    assert.deepEqual([preview.kind, preview.name, preview.invitedBy], ["organization", "Acme", "Ada"]);

    const bob = await signUp("Bob", "bob@example.com", { inviteToken: sent.token });
    assert.deepEqual(bob.me.organizations.map((o) => [o.name, o.role]), [["Acme", "member"]]);
    assert.equal((await app.inject({ method: "GET", url: `/api/invites/${sent.token}` })).statusCode, 404, "used up");

    // Existing accounts accept while logged in; members can't invite.
    const carol = await signUp("Carol", "carol@example.com");
    const asBob = as(bob.cookie);
    const bobInvites = await asBob({
      method: "POST",
      url: `/api/organizations/${organization.id}/invites`,
      payload: { email: "carol@example.com" },
    });
    assert.equal(bobInvites.statusCode, 403);
    const second = (await inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/invites`,
      payload: { email: "carol@example.com" },
    })).json() as OrganizationInvite;
    const accepted = await as(carol.cookie)({ method: "POST", url: `/api/invites/${second.token}/accept` });
    assert.deepEqual(accepted.json() as AcceptedInvite, { kind: "organization", id: organization.id });
  });

  test("joining a team that's in an organization also makes you an organization member", async () => {
    const organization = await createOrganization();
    const team = await createTeam("Marketing", organization.id);
    assert.equal(team.organizationId, organization.id);
    const { token } = (await inject({
      method: "POST",
      url: `/api/teams/${team.id}/invites`,
      payload: { email: "carol@example.com" },
    })).json() as Invite;
    const carol = await signUp("Carol", "carol@example.com", { inviteToken: token });
    assert.deepEqual(carol.me.organizations.map((o) => [o.name, o.role]), [["Acme", "member"]]);
  });

  test("members can create teams in their organization; outsiders can't", async () => {
    const { organization, asBob } = await organizationWithBob();
    const bobsTeam = await asBob({ method: "POST", url: "/api/teams", payload: { name: "Design", organizationId: organization.id } });
    assert.equal(bobsTeam.statusCode, 201);
    assert.deepEqual([(bobsTeam.json() as TeamSummary).role, (bobsTeam.json() as TeamSummary).canManage], ["owner", true]);

    const eve = await signUp("Eve", "eve@example.com");
    const outsider = await as(eve.cookie)({ method: "POST", url: "/api/teams", payload: { name: "Sneaky", organizationId: organization.id } });
    assert.equal(outsider.statusCode, 404);
  });

  test("admins can join and manage any team in the organization; members can't", async () => {
    const { organization, asBob } = await organizationWithBob();
    const design = (await asBob({ method: "POST", url: "/api/teams", payload: { name: "Design", organizationId: organization.id } })).json() as TeamSummary;

    // Ada isn't in Design yet, so she can't open it...
    assert.equal((await inject({ method: "GET", url: `/api/teams/${design.id}/members` })).statusCode, 404);
    // ...but as an admin she can join it, and then manage it.
    const joined = await inject({ method: "POST", url: `/api/organizations/${organization.id}/teams/${design.id}/join` });
    assert.equal(joined.statusCode, 200, joined.body);
    assert.deepEqual([(joined.json() as TeamSummary).role, (joined.json() as TeamSummary).canManage], ["member", true]);
    const renamed = await inject({ method: "PATCH", url: `/api/teams/${design.id}`, payload: { name: "Product design" } });
    assert.equal((renamed.json() as TeamSummary).name, "Product design");
    const teamInvite = await inject({ method: "POST", url: `/api/teams/${design.id}/invites`, payload: { email: "new@example.com" } });
    assert.equal(teamInvite.statusCode, 201);

    // A member (Bob) can't join teams he isn't in.
    const adaTeam = await createTeam("Sales", organization.id);
    const bobJoins = await asBob({ method: "POST", url: `/api/organizations/${organization.id}/teams/${adaTeam.id}/join` });
    assert.equal(bobJoins.statusCode, 403);
  });

  test("in an organization, team managers add colleagues directly; others need a link", async () => {
    const { organization, bobId } = await organizationWithBob();
    const team = await createTeam("Sales", organization.id);
    const added = await inject({ method: "POST", url: `/api/teams/${team.id}/members`, payload: { userId: bobId } });
    assert.equal(added.statusCode, 201, added.body);
    assert.deepEqual((added.json() as Member[]).map((m) => m.name), ["Ada", "Bob"]);

    const eve = await signUp("Eve", "eve@example.com");
    const outsider = await inject({ method: "POST", url: `/api/teams/${team.id}/members`, payload: { userId: eve.me.user.id } });
    assert.equal(outsider.statusCode, 400, "Eve isn't in the organization");

    const standalone = await createTeam("Book club");
    const notInOrganization = await inject({ method: "POST", url: `/api/teams/${standalone.id}/members`, payload: { userId: bobId } });
    assert.equal(notInOrganization.statusCode, 400);
  });

  test("removing someone from the organization takes them out of all its teams", async () => {
    const { organization, bob, bobId, adaId, asBob } = await organizationWithBob();
    // Bob owns a team in the organization, and has a task assigned in Ada's team.
    const design = (await asBob({ method: "POST", url: "/api/teams", payload: { name: "Design", organizationId: organization.id } })).json() as TeamSummary;
    const sales = await createTeam("Sales", organization.id);
    await inject({ method: "POST", url: `/api/teams/${sales.id}/members`, payload: { userId: bobId } });
    const task = (await inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-team-id": String(sales.id) },
      payload: { title: "Bob's job", assigneeId: bobId },
    })).json() as Task;
    await asBob({ method: "POST", url: "/api/tasks", payload: { title: "Bob's own" } });

    const removed = await inject({ method: "DELETE", url: `/api/organizations/${organization.id}/members/${bobId}` });
    assert.equal(removed.statusCode, 204, removed.body);

    const bobNow = await myself(bob.cookie);
    assert.deepEqual(bobNow.organizations, []);
    assert.deepEqual(bobNow.teams.map((t) => t.name), ["Personal"], "out of every team in the organization");
    const bobsTasks = (await asBob({ method: "GET", url: "/api/tasks" })).json() as Task[];
    assert.deepEqual(bobsTasks.map((t) => t.title), ["Bob's own"], "his personal space is untouched");

    // Ada (the admin who removed him) now owns Design; Bob's task in Sales is unassigned.
    const adaNow = await myself();
    assert.equal(adaNow.teams.find((t) => t.id === design.id)?.role, "owner");
    const salesTask = await inject({ method: "GET", url: `/api/tasks/${task.id}`, headers: { "x-team-id": String(sales.id) } });
    assert.equal((salesTask.json() as Task).assigneeId, null);
    assert.ok(adaId);
  });

  test("an organization always keeps an admin", async () => {
    const { organization, bob, bobId, adaId } = await organizationWithBob();
    const url = `/api/organizations/${organization.id}/members`;
    assert.equal((await inject({ method: "PATCH", url: `${url}/${adaId}`, payload: { role: "member" } })).statusCode, 400);
    assert.equal((await inject({ method: "DELETE", url: `${url}/${adaId}` })).statusCode, 400);
    // Members can't change roles.
    assert.equal((await as(bob.cookie)({ method: "PATCH", url: `${url}/${bobId}`, payload: { role: "admin" } })).statusCode, 403);

    // Once Bob is an admin too, Ada can leave; the team she owned goes to Bob.
    const team = await createTeam("Sales", organization.id);
    assert.equal((await inject({ method: "PATCH", url: `${url}/${bobId}`, payload: { role: "admin" } })).statusCode, 204);
    assert.equal((await inject({ method: "DELETE", url: `${url}/${adaId}` })).statusCode, 204);
    const bobNow = await myself(bob.cookie);
    assert.deepEqual(bobNow.organizations.map((o) => o.role), ["admin"]);
    assert.equal(bobNow.teams.find((t) => t.id === team.id)?.role, "owner");
  });

  test("moving a team into an organization needs admin rights and brings its members along", async () => {
    const { organization, asBob } = await organizationWithBob();
    // Ada's team on its own, with Eve in it.
    const team = await createTeam("Book club");
    const { token } = (await inject({ method: "POST", url: `/api/teams/${team.id}/invites`, payload: { email: "eve@example.com" } })).json() as Invite;
    const eve = await signUp("Eve", "eve@example.com", { inviteToken: token });

    // Bob is only a member of Acme, so he can't move his team into it.
    const bobsTeam = (await asBob({ method: "POST", url: "/api/teams", payload: { name: "Bob's" } })).json() as TeamSummary;
    const bobMoves = await asBob({ method: "PATCH", url: `/api/teams/${bobsTeam.id}`, payload: { organizationId: organization.id } });
    assert.equal(bobMoves.statusCode, 403);

    const moved = await inject({ method: "PATCH", url: `/api/teams/${team.id}`, payload: { organizationId: organization.id } });
    assert.equal((moved.json() as TeamSummary).organizationId, organization.id);
    assert.deepEqual((await myself(eve.cookie)).organizations.map((o) => o.name), ["Acme"], "Eve joined Acme with her team");

    const movedOut = await inject({ method: "PATCH", url: `/api/teams/${team.id}`, payload: { organizationId: null } });
    assert.equal((movedOut.json() as TeamSummary).organizationId, null);
  });

  test("the overview: teams with open and overdue tasks, members with their teams", async () => {
    const { organization, bobId, asBob } = await organizationWithBob();
    const team = await createTeam("Sales", organization.id);
    const headers = { "x-team-id": String(team.id) };
    await inject({ method: "POST", url: "/api/tasks", headers, payload: { title: "Late", dueAt: "2020-01-01T09:00:00.000Z" } });
    await inject({ method: "POST", url: "/api/tasks", headers, payload: { title: "Open" } });
    await inject({ method: "POST", url: "/api/tasks", headers, payload: { title: "Finished", status: "done" } });

    const details = (await inject({ method: "GET", url: `/api/organizations/${organization.id}` })).json() as OrganizationDetails;
    assert.deepEqual(
      details.teams.map((t) => [t.name, t.memberCount, t.openTaskCount, t.overdueTaskCount, t.isMember]),
      [["Sales", 1, 2, 1, true]],
    );
    assert.deepEqual(
      details.members.map((m) => [m.name, m.role, m.teamIds]),
      [["Ada", "admin", [team.id]], ["Bob", "member", []]],
    );
    assert.ok(bobId);

    // Bob (a member) sees it too; outsiders don't.
    assert.equal((await asBob({ method: "GET", url: `/api/organizations/${organization.id}` })).statusCode, 200);
    const eve = await signUp("Eve", "eve@example.com");
    assert.equal((await as(eve.cookie)({ method: "GET", url: `/api/organizations/${organization.id}` })).statusCode, 404);
  });

  test("deleting an organization keeps its teams, now on their own", async () => {
    const { organization, asBob } = await organizationWithBob();
    const team = await createTeam("Sales", organization.id);
    assert.equal((await asBob({ method: "DELETE", url: `/api/organizations/${organization.id}` })).statusCode, 403);
    assert.equal((await inject({ method: "DELETE", url: `/api/organizations/${organization.id}` })).statusCode, 204);
    const me = await myself();
    assert.deepEqual(me.organizations, []);
    assert.equal(me.teams.find((t) => t.id === team.id)?.organizationId, null);
  });
});

describe("profile pictures", () => {
  // The smallest real PNG: one pixel.
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const PNG_URL = `data:image/png;base64,${PNG}`;

  const upload = (image: string) => inject({ method: "PUT", url: "/api/me/avatar", payload: { image } });

  test("upload, see it everywhere, remove it", async () => {
    const adaId = ((await inject({ method: "GET", url: "/api/auth/me" })).json() as Me).user.id;
    assert.equal(((await inject({ method: "GET", url: "/api/auth/me" })).json() as Me).user.avatarUpdatedAt, null);

    const response = await upload(PNG_URL);
    assert.equal(response.statusCode, 200, response.body);
    const updatedAt = response.json().avatarUpdatedAt;
    assert.ok(updatedAt);
    assert.equal(((await inject({ method: "GET", url: "/api/auth/me" })).json() as Me).user.avatarUpdatedAt, updatedAt);

    const picture = await inject({ method: "GET", url: `/api/users/${adaId}/avatar?v=${updatedAt}` });
    assert.equal(picture.statusCode, 200);
    assert.equal(picture.headers["content-type"], "image/png");
    assert.equal(picture.headers["x-content-type-options"], "nosniff");
    assert.deepEqual(picture.rawPayload, Buffer.from(PNG, "base64"));

    // Team and organization member lists say who has a picture.
    const team = (await inject({ method: "POST", url: "/api/teams", payload: { name: "Design" } })).json() as TeamSummary;
    const members = (await inject({ method: "GET", url: `/api/teams/${team.id}/members` })).json() as Member[];
    assert.equal(members[0].avatarUpdatedAt, updatedAt);
    const org = (await inject({ method: "POST", url: "/api/organizations", payload: { name: "Acme" } })).json();
    const details = (await inject({ method: "GET", url: `/api/organizations/${org.id}` })).json() as OrganizationDetails;
    assert.equal(details.members[0].avatarUpdatedAt, updatedAt);

    const removed = await inject({ method: "DELETE", url: "/api/me/avatar" });
    assert.equal(removed.json().avatarUpdatedAt, null);
    assert.equal((await inject({ method: "GET", url: `/api/users/${adaId}/avatar` })).statusCode, 404);
  });

  test("only people who share a team or organization see your picture", async () => {
    const adaId = ((await inject({ method: "GET", url: "/api/auth/me" })).json() as Me).user.id;
    await upload(PNG_URL);
    const bob = await signUp("Bob", "bob@example.com");
    const asBob = (options: InjectOptions) => app.inject({ ...options, headers: { cookie: bob.cookie } });
    const url = `/api/users/${adaId}/avatar`;

    // Strangers can't, and neither can someone who isn't logged in.
    assert.equal((await asBob({ method: "GET", url })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);

    // Once Bob is in Ada's team, he can.
    const team = (await inject({ method: "POST", url: "/api/teams", payload: { name: "Design" } })).json() as TeamSummary;
    const { token } = (
      await inject({ method: "POST", url: `/api/teams/${team.id}/invites`, payload: { email: "bob@example.com" } })
    ).json() as Invite;
    assert.equal((await asBob({ method: "POST", url: `/api/invites/${token}/accept` })).statusCode, 200);
    assert.equal((await asBob({ method: "GET", url })).statusCode, 200);
  });

  test("refuses things that aren't pictures, and pictures that are too big", async () => {
    const cases = [
      // An SVG can hold a script, so it's never accepted.
      `data:image/svg+xml;base64,${Buffer.from("<svg onload='alert(1)'/>").toString("base64")}`,
      // Labelled as a PNG, but it's really HTML.
      `data:image/png;base64,${Buffer.from("<html><script>alert(1)</script></html>").toString("base64")}`,
      "not a data url",
      // A real PNG start, but over 200 KB.
      `data:image/png;base64,${Buffer.concat([Buffer.from(PNG, "base64"), Buffer.alloc(210 * 1024)]).toString("base64")}`,
    ];
    for (const image of cases) {
      assert.equal((await upload(image)).statusCode, 400, image.slice(0, 40));
    }
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    assert.equal(me.user.avatarUpdatedAt, null);
  });
});

describe("plan my day", () => {
  const planTask = (taskId: number, day: string) =>
    inject({ method: "PUT", url: `/api/plan/${taskId}`, payload: { day } });
  const plan = async () => (await inject({ method: "GET", url: "/api/plan" })).json() as PlanEntry[];

  test("plan a task for a day, move it to another day, take it out", async () => {
    const me = (await inject({ method: "GET", url: "/api/auth/me" })).json() as Me;
    const personalId = me.teams[0].id;
    const a = await createTask({ title: "Write report" });
    const b = await createTask({ title: "Call the bank" });

    assert.equal((await planTask(a.id, "2026-11-13")).statusCode, 200);
    assert.equal((await planTask(b.id, "2026-11-13")).statusCode, 200);
    assert.deepEqual(await plan(), [
      { taskId: a.id, teamId: personalId, day: "2026-11-13" },
      { taskId: b.id, teamId: personalId, day: "2026-11-13" },
    ]);

    // Planning it again moves it: a task is on one day at most.
    const moved = await planTask(a.id, "2026-11-14");
    assert.deepEqual(moved.json(), { taskId: a.id, teamId: personalId, day: "2026-11-14" });
    assert.deepEqual((await plan()).map((e) => [e.taskId, e.day]), [[b.id, "2026-11-13"], [a.id, "2026-11-14"]]);

    assert.equal((await inject({ method: "DELETE", url: `/api/plan/${b.id}` })).statusCode, 204);
    // Deleting a task takes it out of plans too.
    await inject({ method: "DELETE", url: `/api/tasks/${a.id}` });
    assert.deepEqual(await plan(), []);
  });

  test("plans are personal, and only tasks in your teams can be planned", async () => {
    const task = await createTask({ title: "Ada's task" });
    await planTask(task.id, "2026-11-13");
    const bob = await signUp("Bob", "bob@example.com");
    const asBob = (options: InjectOptions) => app.inject({ ...options, headers: { cookie: bob.cookie } });

    assert.deepEqual((await asBob({ method: "GET", url: "/api/plan" })).json(), []);
    const response = await asBob({ method: "PUT", url: `/api/plan/${task.id}`, payload: { day: "2026-11-13" } });
    assert.equal(response.statusCode, 404);
  });

  test("rejects days that aren't days", async () => {
    const task = await createTask({ title: "Write report" });
    for (const day of ["2026-13-01", "13/11/2026", "2026-11-13T09:00:00Z", ""]) {
      assert.equal((await planTask(task.id, day)).statusCode, 400, day);
    }
  });

  test("the hours you have for tasks is a setting", async () => {
    const settings = (await inject({ method: "GET", url: "/api/settings" })).json() as Settings;
    assert.equal(settings.workdayMinutes, 360);
    const changed = await inject({ method: "PATCH", url: "/api/settings", payload: { workdayMinutes: 480 } });
    assert.equal((changed.json() as Settings).workdayMinutes, 480);
    const tooMuch = await inject({ method: "PATCH", url: "/api/settings", payload: { workdayMinutes: 2000 } });
    assert.equal(tooMuch.statusCode, 400);
  });
});

describe("estimate accuracy", () => {
  /** A finished task with an estimate and `tracked` minutes of time. */
  async function finished(title: string, tag: string, estimateMinutes: number | null, tracked: number) {
    const task = await createTask({ title, tag, estimateMinutes });
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + tracked * 60 * 1000);
    const entry = await inject({
      method: "POST",
      url: "/api/time-entries",
      payload: { taskId: task.id, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() },
    });
    assert.equal(entry.statusCode, 201, entry.body);
    await inject({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { status: "done" } });
    return task;
  }

  const samples = async () => (await inject({ method: "GET", url: "/api/estimates" })).json() as EstimateSample[];

  test("finished tasks with an estimate and tracked time are compared", async () => {
    const report = await finished("Report", "Work", 30, 45);
    await finished("No estimate", "Work", null, 20);
    // Estimated and tracked, but not finished yet: not counted.
    const open = await createTask({ title: "Open", estimateMinutes: 10 });
    await inject({
      method: "POST",
      url: "/api/time-entries",
      payload: { taskId: open.id, startedAt: "2026-11-01T09:00:00.000Z", endedAt: "2026-11-01T09:30:00.000Z" },
    });

    const list = await samples();
    assert.equal(list.length, 1);
    assert.deepEqual(
      { ...list[0], completedAt: undefined },
      { taskId: report.id, tag: "Work", estimateMinutes: 30, trackedMinutes: 45, completedAt: undefined },
    );
  });

  test("only your own tracked time counts, in tasks on your plate", async () => {
    // In a team: a task assigned to Bob, finished, with Ada's and Bob's time on it.
    const team = (await inject({ method: "POST", url: "/api/teams", payload: { name: "Design" } })).json() as TeamSummary;
    const { token } = (
      await inject({ method: "POST", url: `/api/teams/${team.id}/invites`, payload: { email: "bob@example.com" } })
    ).json() as Invite;
    const bob = await signUp("Bob", "bob@example.com", { inviteToken: token });
    const inTeam = { "x-team-id": String(team.id) };
    const asBob = (options: InjectOptions) =>
      app.inject({ ...options, headers: { cookie: bob.cookie, ...inTeam, ...options.headers } });

    const task = (
      await inject({
        method: "POST",
        url: "/api/tasks",
        headers: inTeam,
        payload: { title: "Logo", estimateMinutes: 60, assigneeId: bob.me.user.id },
      })
    ).json() as Task;
    const time = (start: string, end: string) => ({
      method: "POST" as const,
      url: "/api/time-entries",
      payload: { taskId: task.id, startedAt: start, endedAt: end },
    });
    await inject({ ...time("2026-11-01T09:00:00.000Z", "2026-11-01T10:00:00.000Z"), headers: inTeam });
    await asBob(time("2026-11-02T09:00:00.000Z", "2026-11-02T10:30:00.000Z"));
    await asBob({ method: "PATCH", url: `/api/tasks/${task.id}`, payload: { status: "done" } });

    // Bob's task, Bob's 90 minutes. It isn't on Ada's plate, so it's not in hers.
    const bobs = (await asBob({ method: "GET", url: "/api/estimates" })).json() as EstimateSample[];
    assert.deepEqual(bobs.map((s) => [s.taskId, s.trackedMinutes]), [[task.id, 90]]);
    assert.deepEqual(await samples(), []);
  });
});
