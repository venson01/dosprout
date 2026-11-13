"use client";

import { Sprout } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, setCurrentTeamId } from "@/lib/api";
import type { Me, TeamSummary, User } from "@/lib/types";

/** Where the browser remembers which team you were looking at. */
const TEAM_STORAGE_KEY = "dosprout-team";

/** Remember a team, so the app opens it next time (e.g. right after joining it). */
export function rememberTeam(teamId: number) {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, String(teamId));
  } catch {
    // Can't remember it in this browser (e.g. a private window): the personal team opens instead.
  }
}

/** The remembered team if you're still in it, otherwise your personal team. */
function pickTeam(me: Me): TeamSummary {
  let saved: number | null = null;
  try {
    saved = Number(localStorage.getItem(TEAM_STORAGE_KEY));
  } catch {
    // No localStorage: use the personal team.
  }
  return me.teams.find((team) => team.id === saved) ?? me.teams.find((team) => team.personal) ?? me.teams[0];
}

/**
 * Only follow "?next=" links inside this site, so a link to DoSprout can't send you to
 * another website after logging in.
 */
export function safeNextPath(next: string | null, fallback = "/tasks"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

interface Auth {
  user: User;
  /** Every team you're in (your personal team first). */
  teams: TeamSummary[];
  /** The team the app is showing. Tasks, goals, calendar and time all come from it. */
  team: TeamSummary;
  switchTeam: (teamId: number) => void;
  /**
   * Loads your account and teams again (after creating, renaming, leaving... a team).
   * Then shows `showTeamId` if given (e.g. a team you just created), else the current team
   * (or your personal team if the current one is gone).
   */
  refresh: (showTeamId?: number) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

/**
 * Loads who is logged in, once, for the app pages. Nobody logged in? Then it sends you to
 * the login page (and back here afterwards). It also keeps track of the current team and
 * tells lib/api.ts, so every request is about that team.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Shows a team: requests from now on are about it. */
  const show = useCallback((next: TeamSummary) => {
    setCurrentTeamId(next.id);
    rememberTeam(next.id);
    setTeam(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (loaded) => {
        if (cancelled) return;
        show(pickTeam(loaded));
        setMe(loaded);
      },
      (failure: ApiError) => {
        if (cancelled) return;
        if (failure.status === 401) {
          // Not logged in: log in first, then come back to this page.
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        } else {
          setError(failure.message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Only on the first load (and "Try again"), not on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const switchTeam = useCallback(
    (teamId: number) => {
      const next = me?.teams.find((t) => t.id === teamId);
      if (next) show(next);
    },
    [me, show],
  );

  const refresh = useCallback(
    async (showTeamId?: number) => {
      const loaded = await api.me();
      setMe(loaded);
      // The current team may have been renamed, deleted or left.
      const current = loaded.teams.find((t) => t.id === (showTeamId ?? team?.id));
      show(current ?? loaded.teams.find((t) => t.personal) ?? loaded.teams[0]);
    },
    [team, show],
  );

  const logOut = useCallback(async () => {
    await api.logOut().catch(() => {});
    setCurrentTeamId(null);
    // The login page is outside the app layout, so this provider (and every task, goal
    // and timer loaded for this account) is thrown away on the way there.
    router.replace("/login");
  }, [router]);

  if (error) {
    return (
      <FullScreen>
        <p className="font-medium">Couldn&apos;t load your account</p>
        <p className="max-w-sm text-sm text-muted">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Try again
        </button>
      </FullScreen>
    );
  }
  if (!me || !team) {
    return (
      <FullScreen>
        <Sprout className="size-8 animate-pulse text-brand motion-reduce:animate-none" aria-hidden />
        <p className="text-sm text-muted" role="status">
          Loading your space...
        </p>
      </FullScreen>
    );
  }

  return (
    <AuthContext value={{ user: me.user, teams: me.teams, team, switchTeam, refresh, logOut }}>
      {children}
    </AuthContext>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="flex flex-col items-center gap-2 text-center">{children}</div>
    </div>
  );
}

/** The logged-in user, their teams and the current team. Only inside <AuthProvider> (the app pages). */
export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth() must be used inside <AuthProvider>");
  return value;
}
