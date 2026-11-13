import { CircleAlert, Sprout } from "lucide-react";
import Link from "next/link";

// Shared look for the login, sign-up and invite pages: a centered card with the logo.

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";

export const primaryButton =
  "w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-70";

export const secondaryButton =
  "block w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-center text-sm font-medium hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mx-auto mb-6 flex w-fit items-center gap-1.5 rounded-md text-xl font-semibold focus-visible:outline-2 focus-visible:outline-brand"
        >
          DoSprout
          <Sprout className="size-5 text-brand" strokeWidth={2.5} aria-hidden />
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** A labelled input. */
export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input {...input} className={inputClass} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** A form's error message (read out by screen readers as soon as it appears). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
