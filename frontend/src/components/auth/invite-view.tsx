"use client";

import { Building2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rememberTeam } from "@/hooks/auth-context";
import { api, ApiError } from "@/lib/api";
import type { InvitePreview, Me } from "@/lib/types";
import { AuthCard, FormError, primaryButton, secondaryButton } from "./auth-card";

type State =
  | { kind: "loading" }
  | { kind: "gone"; message: string }
  /** me = null: nobody is logged in in this browser. */
  | { kind: "ready"; invite: InvitePreview; me: Me | null };

/**
 * The page an invite link opens (/invite/<token>). It says which team you're invited to,
 * then: logged in as the invited address -> "Join"; not logged in -> sign up or log in
 * (and come back here); logged in as someone else -> explains what to do.
 */
export function InviteView({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not being logged in is fine here, so a 401 from /auth/me just means "nobody".
    const whoAmI = api.me().catch((failure: ApiError) => {
      if (failure.status === 401) return null;
      throw failure;
    });
    Promise.all([api.previewInvite(token), whoAmI]).then(
      ([invite, me]) => {
        if (!cancelled) setState({ kind: "ready", invite, me });
      },
      (failure: Error) => {
        if (!cancelled) setState({ kind: "gone", message: failure.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const joined = await api.acceptInvite(token);
      if (joined.kind === "team") {
        rememberTeam(joined.id);
        router.replace("/tasks");
      } else {
        router.replace("/organization");
      }
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  async function logOutAndStay() {
    await api.logOut().catch(() => {});
    window.location.reload();
  }

  if (state.kind === "loading") {
    return (
      <AuthCard title="Opening your invite...">
        <p className="text-sm text-muted" role="status">
          One moment.
        </p>
      </AuthCard>
    );
  }

  if (state.kind === "gone") {
    return (
      <AuthCard title="This invite can't be used">
        <p className="text-sm text-muted">{state.message}</p>
        <Link href="/" className={`${secondaryButton} mt-6`}>
          Go to the DoSprout home page
        </Link>
      </AuthCard>
    );
  }

  const { invite, me } = state;
  const here = `/invite/${encodeURIComponent(token)}`;
  const organization = invite.kind === "organization";
  const Icon = organization ? Building2 : Users;
  const subtitle = (
    <>
      <strong className="font-medium text-ink">{invite.invitedBy}</strong> invited{" "}
      <strong className="font-medium text-ink">{invite.email}</strong>{" "}
      {organization
        ? "to join their organization on DoSprout. Its admins can then add you to its teams."
        : "to work together on DoSprout: shared tasks, goals and a calendar."}
    </>
  );

  return (
    <AuthCard title={`Join ${invite.name}`} subtitle={subtitle}>
      <div className="mb-6 flex items-center gap-3 rounded-xl bg-brand-soft p-4 text-brand">
        <Icon className="size-6 shrink-0" aria-hidden />
        <p className="font-medium">
          {invite.name}
          {organization && <span className="block text-xs font-normal">Organization</span>}
        </p>
      </div>

      {me === null && (
        <div className="space-y-3">
          <Link
            href={`/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`}
            className={`${primaryButton} block text-center`}
          >
            Create an account and join
          </Link>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className={secondaryButton}>
            I already have an account
          </Link>
        </div>
      )}

      {me !== null && me.user.email === invite.email && (
        <div className="space-y-3">
          <FormError message={error} />
          <button type="button" onClick={join} disabled={busy} className={primaryButton}>
            {busy ? "Joining..." : `Join ${invite.name}`}
          </button>
        </div>
      )}

      {me !== null && me.user.email !== invite.email && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            You&apos;re logged in as <strong className="font-medium text-ink">{me.user.email}</strong>, but this
            invite is for <strong className="font-medium text-ink">{invite.email}</strong>. Log out, then sign up
            or log in with that address. (Or ask {organization ? "an admin" : "the team owner"} to invite{" "}
            {me.user.email} instead.)
          </p>
          <button type="button" onClick={logOutAndStay} className={primaryButton}>
            Log out
          </button>
        </div>
      )}
    </AuthCard>
  );
}
