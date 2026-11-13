import type { Client } from "@libsql/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_DAYS, type AccountStore } from "./account-store.js";
import { BackupStore } from "./backup-store.js";
import { GoalStore } from "./goal-store.js";
import { SettingsStore } from "./settings-store.js";
import { TaskStore } from "./task-store.js";
import type { TeamStore } from "./team-store.js";
import { TimeStore } from "./time-store.js";
import type { TeamSummary, User } from "./types.js";

// Tell TypeScript about the things our hooks add to every request.
declare module "fastify" {
  interface FastifyRequest {
    /** Who is logged in. Set by requireLogin. */
    user: User;
    /** The team this request is about. Set by useTeam. */
    team: TeamSummary;
    /** Stores that only see request.team (and, for time and settings, request.user). Set by useTeam. */
    stores: {
      tasks: TaskStore;
      goals: GoalStore;
      time: TimeStore;
      settings: SettingsStore;
      backup: BackupStore;
    };
  }
}

/** The browser keeps the login token in this cookie and sends it with every request. */
export const SESSION_COOKIE = "dosprout_session";

/** Which team a request is about. The frontend sends it with every request (lib/api.ts). */
export const TEAM_HEADER = "x-team-id";

/** Reads one cookie from the request's Cookie header ("a=1; dosprout_session=xyz"). */
export function readCookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of request.headers.cookie?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

/**
 * The Set-Cookie header that stores the login token in the browser.
 * - HttpOnly: page JavaScript can't read it, so a script injected into a page can't steal it.
 * - SameSite=Lax: other websites can't make the browser send it with their requests.
 * - Secure: only sent over HTTPS (on the live site; local development uses plain HTTP).
 */
export function sessionCookie(token: string, secure: boolean): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** A Set-Cookie header that deletes the login cookie (logging out). */
export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.code(statusCode).send({ statusCode, error, message });
}

/**
 * A hook that stops requests from people who aren't logged in (401),
 * and otherwise sets request.user.
 */
export function requireLogin(accounts: AccountStore) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = readCookie(request, SESSION_COOKIE);
    const user = token ? await accounts.userForSession(token) : undefined;
    if (!user) return sendError(reply, 401, "Unauthorized", "You're not logged in. Please log in and try again.");
    request.user = user;
  };
}

/**
 * A hook (after requireLogin) that works out which team the request is about, from the
 * X-Team-Id header (or your personal team when there's none), checks that you're in it,
 * and sets request.team and request.stores.
 */
export function useTeam(db: Client, teams: TeamStore) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers[TEAM_HEADER];
    const team =
      typeof header === "string"
        ? await teams.membership(Number(header), request.user.id)
        : await teams.personalTeam(request.user.id);
    if (!team) {
      return sendError(reply, 404, "Not Found", "That team doesn't exist, or you're no longer in it. Reload the page.");
    }
    request.team = team;
    const userId = request.user.id;
    request.stores = {
      tasks: new TaskStore(db, team.id),
      goals: new GoalStore(db, team.id),
      time: new TimeStore(db, team.id, userId),
      settings: new SettingsStore(db, userId),
      backup: new BackupStore(db, team.id, userId),
    };
  };
}

/**
 * Replies 403 unless you may manage request.team (you own it, or you're an admin of its
 * organization). Returns true when it replied.
 */
export function cannotManage(request: FastifyRequest, reply: FastifyReply, message: string): boolean {
  if (request.team.canManage) return false;
  sendError(reply, 403, "Forbidden", message);
  return true;
}
