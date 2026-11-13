"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { rememberTeam, safeNextPath } from "@/hooks/auth-context";
import { api } from "@/lib/api";
import { AuthCard, Field, FormError, primaryButton } from "./auth-card";

/** Must match the backend's rule (routes/auth.ts). */
const MIN_PASSWORD = 8;

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // From an invite link (/invite/<token>): join that team while signing up.
  const inviteToken = searchParams.get("invite") ?? undefined;
  const next = safeNextPath(searchParams.get("next"));
  // "Log in" instead? Then come back to where you were going (with an invite: the invite page).
  const afterLogin = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : next;
  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api.signUp({ name, email, password, inviteToken });
      // Joined a team through the invite? Open that team first.
      const joined = me.teams.find((team) => !team.personal);
      if (joined) rememberTeam(joined.id);
      // Joined an organization (but no team yet)? Show it, so they see what they joined.
      const joinedOrganization = !joined && me.organizations.length > 0;
      router.replace(joinedOrganization && next === "/tasks" ? "/organization" : next);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={inviteToken ? "Create your account to join" : "Create your account"}
      subtitle="Free, and it only takes a moment. You get a private space for your own tasks, and you can create or join teams."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Your name"
          autoComplete="name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={inviteToken ? "Use the address the invite was sent to." : undefined}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <FormError message={error} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Creating your account..." : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={afterLogin === "/tasks" ? "/login" : `/login?next=${encodeURIComponent(afterLogin)}`}
          className="font-medium text-brand hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
