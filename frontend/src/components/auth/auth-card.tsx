"use client";

import { ArrowRight, CircleAlert, Eye, EyeOff, Leaf, LoaderCircle, type LucideIcon, Sprout } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { AuthArt, type AuthMood } from "./auth-art";

// Shared look for the login, sign-up and invite pages: the form card on a softly moving
// background, and (on large screens) the illustrated blue panel next to it (auth-art.tsx).
// Every animation has a motion-reduce: class, so "reduce motion" users get a still page.
// "big:" / "huge:" classes (see globals.css) make things larger on large monitors.

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none sm:py-2.5 transition-[border-color,box-shadow] placeholder:text-muted hover:border-muted/50 focus:border-brand focus:ring-4 focus:ring-brand/15 motion-reduce:transition-none big:py-3 big:text-base huge:py-4 huge:text-lg";

export const primaryButton =
  "group flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white sm:py-3 shadow-md shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/30 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:translate-y-0 big:py-3.5 big:text-base huge:rounded-2xl huge:py-4.5 huge:text-lg";

export const secondaryButton =
  "block w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none big:py-3.5 big:text-base huge:py-4.5 huge:text-lg";

export function AuthCard({
  title,
  subtitle,
  mood = "login",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Which headline the illustrated panel shows. */
  mood?: AuthMood;
  children: React.ReactNode;
}) {
  return (
    // Exactly one screen tall (h-dvh), so the page itself never scrolls. Everything inside is
    // sized to fit; only on a really short window (a phone on its side) can the form column
    // scroll on its own, so the form is never cut off.
    // On large screens the form side gets about 58% of the width and the blue panel 42%.
    // On large monitors ("big:" / "huge:" in globals.css) the card, text and fields grow too.
    <main className="grid h-dvh overflow-hidden bg-page lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="relative isolate flex min-h-0 flex-col overflow-y-auto px-4 py-4 sm:px-8 sm:py-5 big:px-12 big:py-8 huge:px-16 huge:py-10">
        <FormBackground />

        <Link
          href="/"
          className="group flex w-fit items-center gap-1.5 rounded-md text-lg font-semibold focus-visible:outline-2 focus-visible:outline-brand sm:text-xl big:text-2xl huge:text-3xl"
        >
          DoSprout
          <Sprout
            className="size-5 origin-bottom text-brand group-hover:animate-sway big:size-6 huge:size-7 motion-reduce:group-hover:animate-none"
            strokeWidth={2.5}
            aria-hidden
          />
        </Link>

        {/* Phones get a compact card (so it fits the screen), bigger screens a roomier one. */}
        <div className="mx-auto my-auto w-full max-w-sm pt-8 pb-1 sm:max-w-[27rem] big:max-w-[32rem] huge:max-w-[42rem] huge:pt-12">
          <div className="relative animate-card-in rounded-3xl border border-line bg-surface/85 px-5 py-5 shadow-xl shadow-brand/5 backdrop-blur-xl motion-reduce:animate-none sm:px-9 sm:py-8 big:rounded-[2rem] big:px-12 big:py-11 huge:rounded-[2.5rem] huge:px-16 huge:py-14">
            <PeekingSprout />
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl big:text-3xl huge:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-pretty text-muted sm:mt-1.5 big:mt-2 big:text-base huge:text-xl">{subtitle}</p>}
            <div className="mt-4 sm:mt-6 big:mt-8 huge:mt-10">{children}</div>
          </div>
        </div>
      </div>

      <AuthArt mood={mood} />
    </main>
  );
}

/** Soft colored blobs that drift slowly, a faint dot grid and a few floating leaves. */
function FormBackground() {
  return (
    // overflow-hidden here: the blobs reach past the edges and must not make the column scroll.
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-line)_1.5px,transparent_1.5px)] bg-size-[26px_26px] mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="absolute -top-32 -left-24 size-96 animate-drift rounded-full bg-brand/15 blur-3xl motion-reduce:animate-none" />
      <div
        className="absolute -right-24 -bottom-32 size-96 animate-drift rounded-full bg-goal-aqua/15 blur-3xl motion-reduce:animate-none"
        style={{ animationDelay: "-10s" }}
      />
      <Leaf className="absolute top-[18%] right-[12%] size-6 rotate-12 animate-float text-goal-aqua/50 motion-reduce:animate-none" />
      <Leaf
        className="absolute bottom-[14%] left-[10%] size-5 -rotate-45 animate-float text-brand/40 motion-reduce:animate-none"
        style={{ animationDelay: "-3s" }}
      />
      <Sprout
        className="absolute top-[62%] right-[8%] hidden size-7 animate-float text-goal-yellow/60 motion-reduce:animate-none sm:block"
        style={{ animationDelay: "-1.5s" }}
      />
    </div>
  );
}

/** A little sprout growing out of the card's top edge, swaying in the wind. */
function PeekingSprout() {
  return (
    <span
      aria-hidden
      className="absolute -top-[26px] right-7 grid origin-bottom big:-top-[34px] big:right-10 huge:-top-[42px] huge:right-14 animate-pop motion-reduce:animate-none"
      style={{ animationDelay: "500ms" }}
    >
      <Sprout
        className="size-7 origin-bottom animate-sway text-goal-aqua big:size-9 huge:size-11 motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    </span>
  );
}

/** A labelled input, with an optional icon on the left that lights up while you type. */
export function Field({
  label,
  hint,
  icon: Icon,
  trailing,
  ...input
}: {
  label: string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Something inside the input on the right (e.g. the "show password" button). */
  trailing?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  // The label and hint point at the input by id (useId gives a unique one).
  const id = useId();
  return (
    // Not a <label> around everything: the trailing button must not focus the input when clicked.
    <div className="group">
      <label htmlFor={id} className="mb-1 block text-sm font-medium sm:mb-1.5 big:mb-2 big:text-base huge:text-lg">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-brand big:left-3.5 big:size-5 huge:left-4.5 huge:size-6"
          />
        )}
        <input
          {...input}
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${inputClass} ${Icon ? "pl-9 big:pl-11 huge:pl-14" : ""} ${trailing ? "pr-11 big:pr-13 huge:pr-16" : ""}`}
        />
        {trailing}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="mt-1 text-xs text-muted big:mt-1.5 big:text-sm huge:text-base">
          {hint}
        </div>
      )}
    </div>
  );
}

/** A password input with a button to show what you typed. */
export function PasswordField(props: Omit<React.ComponentProps<typeof Field>, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-2 focus-visible:outline-brand big:right-1.5 big:size-10 huge:right-2 huge:size-12"
        >
          <Icon className="size-4 big:size-5 huge:size-6" aria-hidden />
        </button>
      }
    />
  );
}

/** The form's main button: an arrow that nudges forward on hover, a spinner while busy. */
export function SubmitButton({ busy, busyLabel, children }: { busy: boolean; busyLabel: string; children: string }) {
  return (
    <button type="submit" disabled={busy} className={primaryButton}>
      {busy ? (
        <>
          <LoaderCircle className="size-4 big:size-5 huge:size-6 animate-spin motion-reduce:animate-none" aria-hidden />
          {busyLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-1 big:size-5 huge:size-6 motion-reduce:transition-none"
            aria-hidden
          />
        </>
      )}
    </button>
  );
}

/** A form's error message (read out by screen readers as soon as it appears). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex animate-card-in items-start gap-2 rounded-xl bg-high-bg px-3 py-2 text-sm text-high motion-reduce:animate-none big:px-4 big:py-3 big:text-base huge:text-lg"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
