import type { InStatement } from "@libsql/client";

/** A UTC timestamp for a local time a number of days from today, e.g. (2, 17) = 5 PM the day after tomorrow. */
function daysFromToday(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/** A local day a number of days from today, as "2026-10-13" (for goal target dates). */
function dayFromToday(days: number): string {
  return daysFromToday(days, 12).slice(0, 10);
}

// The example tasks. `goal: true` links a task to the example goal.
// `time` is tracked time on that task: [days from today, [start hour, minute], [end hour, minute]].
const EXAMPLES = [
  { title: "Website Development", status: "todo", priority: "high", tag: "Work", start: 1, due: 2, goal: true, estimate: 480,
    subtasks: [["Wireframes", 0], ["Build landing page", 0], ["Connect API", 0], ["Deploy", 0]], time: [] },
  { title: "Update Contact Form", status: "todo", priority: "mid", tag: "Work", start: 2, due: 3, goal: true, estimate: 90,
    subtasks: [["Add phone field", 0], ["Validate email", 0]], time: [] },
  { title: "Do back exercises", status: "in_progress", priority: "mid", tag: "Health", start: 0, due: 2, goal: false, estimate: 30,
    subtasks: [["Stretch", 1], ["Plank", 1], ["Bridges", 0]], time: [[-1, [18, 0], [18, 25]]] },
  { title: "Integrate Payment Gateway", status: "in_progress", priority: "low", tag: "Work", start: -1, due: 2, goal: true, estimate: 240,
    subtasks: [["Create sandbox account", 1], ["Checkout page", 1], ["Webhooks", 0]],
    time: [[-1, [9, 0], [10, 30]], [0, [9, 15], [10, 0]]] },
  { title: "Visit a dermatologist", status: "done", priority: "high", tag: "Health", start: -2, due: -1, goal: false, estimate: null,
    subtasks: [["Book appointment", 1]], time: [] },
] as const;

/**
 * Example data so a new account doesn't look empty: one goal, five tasks with subtasks,
 * and a little tracked time, all in the given team and (for the time) the given user.
 *
 * It all runs in one batch (one transaction), so the new rows' ids aren't known in
 * advance. Each row that needs one looks it up instead: right after a goal or task is
 * inserted, it's the highest id in its table (the same trick TaskStore.create uses).
 */
export function exampleDataStatements(teamId: number, userId: number): InStatement[] {
  const LATEST_GOAL = "(SELECT MAX(id) FROM goals)";
  const LATEST_TASK = "(SELECT MAX(id) FROM tasks)";

  const goal: InStatement = {
    sql: "INSERT INTO goals (team_id, title, description, color, target_date) VALUES (?, ?, ?, ?, ?)",
    args: [teamId, "Launch the new website", "Everything needed before the site goes live.", "blue", dayFromToday(14)],
  };

  return [
    goal,
    ...EXAMPLES.flatMap((example, index): InStatement[] => [
      {
        sql: `INSERT INTO tasks (team_id, title, status, priority, tag, start_at, due_at, position, completed_at, goal_id, estimate_minutes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${example.goal ? LATEST_GOAL : "NULL"}, ?)`,
        args: [
          teamId,
          example.title,
          example.status,
          example.priority,
          example.tag,
          daysFromToday(example.start, 9),
          daysFromToday(example.due, 17),
          index,
          // Finished examples were "completed" at noon on their due day.
          example.status === "done" ? daysFromToday(example.due, 12) : null,
          example.estimate,
        ],
      },
      ...example.subtasks.map(([title, done], position) => ({
        sql: `INSERT INTO subtasks (task_id, title, done, position) VALUES (${LATEST_TASK}, ?, ?, ?)`,
        args: [title, done, position],
      })),
      ...example.time.map(([day, [h1, m1], [h2, m2]]) => ({
        sql: `INSERT INTO time_entries (team_id, user_id, task_id, kind, started_at, ended_at)
              VALUES (?, ?, ${LATEST_TASK}, 'timer', ?, ?)`,
        args: [teamId, userId, daysFromToday(day, h1, m1), daysFromToday(day, h2, m2)],
      })),
    ]),
  ];
}
