import type { CreateTaskInput, Task, UpdateTaskInput } from "./types";

// Where the Fastify backend runs. Change it in frontend/.env.local if needed.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    // fetch only throws when the server can't be reached at all.
    throw new ApiError(`Can't reach the API at ${API_URL}. Is the backend running?`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  listTasks: () => request<Task[]>("/tasks"),
  getTask: (id: number) => request<Task>(`/tasks/${id}`),
  createTask: (input: CreateTaskInput) =>
    request<Task>("/tasks", { method: "POST", body: json(input) }),
  updateTask: (id: number, input: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: json(input) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: "DELETE" }),

  addSubtask: (taskId: number, title: string) =>
    request<Task>(`/tasks/${taskId}/subtasks`, { method: "POST", body: json({ title }) }),
  updateSubtask: (taskId: number, subtaskId: number, input: { title?: string; done?: boolean }) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: "PATCH",
      body: json(input),
    }),
  deleteSubtask: (taskId: number, subtaskId: number) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: "DELETE" }),
};
