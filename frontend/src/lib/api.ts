import type {
  AcceptedInvite,
  Backup,
  CreateGoalInput,
  CreateTaskInput,
  CreateTimeEntryInput,
  Goal,
  Invite,
  InvitePreview,
  LoginInput,
  Me,
  Member,
  MyWorkGroup,
  OrganizationDetails,
  OrganizationInvite,
  OrganizationRole,
  OrganizationSummary,
  Settings,
  SignupInput,
  StartTimerInput,
  Task,
  TeamSummary,
  TimeEntry,
  UpdateGoalInput,
  User,
  UpdateSettingsInput,
  UpdateTaskInput,
  UpdateTimeEntryInput,
} from "./types";

// The API lives at /api on the same address as the website:
// - on Vercel, vercel.json sends /api/... to the backend service
// - locally, next.config.ts forwards /api/... to the backend on port 4000
// Only set NEXT_PUBLIC_API_URL if the backend is on a different domain.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const UNREACHABLE = "Can't reach the API. Is the backend running?";

// The team the app is showing. Every request says which team it's about with the
// X-Team-Id header, and the backend only answers with that team's tasks, goals and time.
// AuthProvider sets it (hooks/auth-context.tsx). null = your personal team.
let currentTeamId: number | null = null;

export function setCurrentTeamId(teamId: number | null) {
  currentTeamId = teamId;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** `teamId`: the team the request is about, if not the current one (used by "My work"). */
async function request<T>(path: string, init: RequestInit = {}, teamId = currentTeamId): Promise<T> {
  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (init.body) headers["Content-Type"] = "application/json";
    if (teamId !== null) headers["X-Team-Id"] = String(teamId);
    response = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers,
      // Send the login cookie. (Same-site requests do this anyway; this is for a
      // backend on another domain, see NEXT_PUBLIC_API_URL.)
      credentials: "include",
    });
  } catch {
    // fetch only throws when the server can't be reached at all.
    throw new ApiError(UNREACHABLE);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // Our API always answers errors with JSON. A server error without it means the
    // request never reached the API (e.g. the local /api forwarding found no backend).
    if (!body && response.status >= 500) {
      throw new ApiError(`The API isn't responding (error ${response.status}).`, response.status);
    }
    throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const json = (body: unknown) => JSON.stringify(body);

/**
 * The address of someone's profile picture, for an <img>. `version` (their avatarUpdatedAt)
 * changes with every new picture, so the browser can keep each one cached for good.
 */
export function avatarUrl(userId: number, version: string): string {
  return `${API_URL}/api/users/${userId}/avatar?v=${encodeURIComponent(version)}`;
}

export const api = {
  // ---- Accounts ----
  /** Who is logged in (401 if nobody). */
  me: () => request<Me>("/auth/me"),
  signUp: (input: SignupInput) => request<Me>("/auth/signup", { method: "POST", body: json(input) }),
  logIn: (input: LoginInput) => request<Me>("/auth/login", { method: "POST", body: json(input) }),
  logOut: () => request<void>("/auth/logout", { method: "POST" }),
  /** image: a data URL ("data:image/jpeg;base64,..."), see lib/avatar-image.ts. */
  setAvatar: (image: string) => request<User>("/me/avatar", { method: "PUT", body: json({ image }) }),
  removeAvatar: () => request<User>("/me/avatar", { method: "DELETE" }),

  // ---- Teams ----
  /** organizationId: create it in one of your organizations (null / left out: on its own). */
  createTeam: (name: string, organizationId: number | null = null) =>
    request<TeamSummary>("/teams", { method: "POST", body: json({ name, organizationId }) }),
  renameTeam: (teamId: number, name: string) =>
    request<TeamSummary>(`/teams/${teamId}`, { method: "PATCH", body: json({ name }) }),
  /** Moves a team into an organization, or out of it (null). */
  moveTeam: (teamId: number, organizationId: number | null) =>
    request<TeamSummary>(`/teams/${teamId}`, { method: "PATCH", body: json({ organizationId }) }),
  /** In an organization's team: adds a colleague straight away. Returns the new member list. */
  addTeamMember: (teamId: number, userId: number) =>
    request<Member[]>(`/teams/${teamId}/members`, { method: "POST", body: json({ userId }) }),
  deleteTeam: (teamId: number) => request<void>(`/teams/${teamId}`, { method: "DELETE" }),
  listMembers: (teamId: number) => request<Member[]>(`/teams/${teamId}/members`),
  /** The owner removes someone, or you leave (your own user id). */
  removeMember: (teamId: number, userId: number) =>
    request<void>(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
  listInvites: (teamId: number) => request<Invite[]>(`/teams/${teamId}/invites`),
  createInvite: (teamId: number, email: string) =>
    request<Invite>(`/teams/${teamId}/invites`, { method: "POST", body: json({ email }) }),
  deleteInvite: (teamId: number, inviteId: number) =>
    request<void>(`/teams/${teamId}/invites/${inviteId}`, { method: "DELETE" }),
  /** What an invite link is for: a team or an organization (works without logging in). */
  previewInvite: (token: string) => request<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<AcceptedInvite>(`/invites/${encodeURIComponent(token)}/accept`, { method: "POST" }),

  // ---- Organizations ----
  createOrganization: (name: string) =>
    request<OrganizationSummary>("/organizations", { method: "POST", body: json({ name }) }),
  /** Its teams (with open / overdue counts) and members (with their teams). */
  getOrganization: (id: number) => request<OrganizationDetails>(`/organizations/${id}`),
  renameOrganization: (id: number, name: string) =>
    request<OrganizationSummary>(`/organizations/${id}`, { method: "PATCH", body: json({ name }) }),
  /** Its teams are kept, on their own. */
  deleteOrganization: (id: number) => request<void>(`/organizations/${id}`, { method: "DELETE" }),
  setOrganizationRole: (id: number, userId: number, role: OrganizationRole) =>
    request<void>(`/organizations/${id}/members/${userId}`, { method: "PATCH", body: json({ role }) }),
  /** Out of the organization and all its teams (your own user id = leave). */
  removeOrganizationMember: (id: number, userId: number) =>
    request<void>(`/organizations/${id}/members/${userId}`, { method: "DELETE" }),
  /** Admins: join one of the organization's teams. */
  joinOrganizationTeam: (id: number, teamId: number) =>
    request<TeamSummary>(`/organizations/${id}/teams/${teamId}/join`, { method: "POST" }),
  listOrganizationInvites: (id: number) => request<OrganizationInvite[]>(`/organizations/${id}/invites`),
  createOrganizationInvite: (id: number, email: string) =>
    request<OrganizationInvite>(`/organizations/${id}/invites`, { method: "POST", body: json({ email }) }),
  deleteOrganizationInvite: (id: number, inviteId: number) =>
    request<void>(`/organizations/${id}/invites/${inviteId}`, { method: "DELETE" }),

  // ---- My work (all your teams at once) ----
  myWork: () => request<MyWorkGroup[]>("/my-work"),
  /** Changes a task in a given team (My work shows tasks from every team). */
  updateTaskInTeam: (teamId: number, id: number, input: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: json(input) }, teamId),

  // ---- Tasks, goals and time (in the current team) ----
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

  listGoals: () => request<Goal[]>("/goals"),
  createGoal: (input: CreateGoalInput) =>
    request<Goal>("/goals", { method: "POST", body: json(input) }),
  updateGoal: (id: number, input: UpdateGoalInput) =>
    request<Goal>(`/goals/${id}`, { method: "PATCH", body: json(input) }),
  deleteGoal: (id: number) => request<void>(`/goals/${id}`, { method: "DELETE" }),

  listTimeEntries: () => request<TimeEntry[]>("/time-entries"),
  startTimer: (input: StartTimerInput) =>
    request<TimeEntry>("/time-entries/start", { method: "POST", body: json(input) }),
  stopTimer: () => request<TimeEntry>("/time-entries/stop", { method: "POST" }),
  createTimeEntry: (input: CreateTimeEntryInput) =>
    request<TimeEntry>("/time-entries", { method: "POST", body: json(input) }),
  updateTimeEntry: (id: number, input: UpdateTimeEntryInput) =>
    request<TimeEntry>(`/time-entries/${id}`, { method: "PATCH", body: json(input) }),
  deleteTimeEntry: (id: number) => request<void>(`/time-entries/${id}`, { method: "DELETE" }),

  getSettings: () => request<Settings>("/settings"),
  updateSettings: (input: UpdateSettingsInput) =>
    request<Settings>("/settings", { method: "PATCH", body: json(input) }),
  /** The current team's data as one object, for a backup file. */
  exportData: () => request<Backup>("/export"),
  /** Replaces ALL of the current team's data with a backup's (owners only). */
  importData: (backup: unknown) =>
    request<{ ok: true }>("/import", { method: "POST", body: json(backup) }),
  /** Deletes every task, goal and time entry in the current team (owners only; settings stay). */
  deleteAllData: () => request<void>("/data", { method: "DELETE" }),
};
