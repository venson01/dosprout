"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/hooks/auth-context";
import { api } from "@/lib/api";
import { AuthCard, Field, FormError, primaryButton } from "./auth-card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to go afterwards (e.g. back to an invite link). Only pages on this site.
  const next = safeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.logIn({ email, password });
      router.replace(next);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to see your tasks and your teams.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        New to DoSprout?{" "}
        <Link
          // Keep "next" so an invite link still works after signing up instead.
          href={next === "/tasks" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
