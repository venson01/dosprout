"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/hooks/auth-context";
import { api } from "@/lib/api";
import { LockKeyhole, Mail } from "lucide-react";
import { AuthCard, Field, FormError, PasswordField, SubmitButton } from "./auth-card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to go afterwards (e.g. back to an invite link). Only pages on this site.
  // (The form is sized so the whole page fits on one screen, see AuthCard.)
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
    <AuthCard mood="login" title="Welcome back" subtitle="Log in to see your tasks and your teams.">
      <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 big:space-y-5 huge:space-y-7">
        <Field
          label="Email"
          icon={Mail}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Password"
          icon={LockKeyhole}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <SubmitButton busy={busy} busyLabel="Logging in...">
          Log in
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted big:mt-6 big:text-base huge:mt-8 huge:text-lg">
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
