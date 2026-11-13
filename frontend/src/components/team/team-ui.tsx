"use client";

import { Check, Copy, Mail, Trash } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { formatDateTime } from "@/lib/task-helpers";

// Pieces shared by the Team and Organization pages.

export const inputClass =
  "w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";
export const brandButton =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-hover disabled:opacity-60";
export const quietButton =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand ring-1 ring-line hover:bg-brand-soft disabled:opacity-60";
export const dangerButton =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-high px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

/** The address an invite link opens. Only called in the browser (invites load after the page does). */
export function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function Card({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The link in a box you can select, plus a Copy button. */
export function CopyLink({ link }: { link: string }) {
  return (
    <div className="mt-2 flex gap-2">
      <input
        readOnly
        value={link}
        aria-label="Invite link"
        onFocus={(e) => e.target.select()}
        className={`${inputClass} flex-1 font-mono text-xs`}
      />
      <CopyButton text={link} label="Copy the invite link" />
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers block the clipboard; the link is still there to select and copy.
      window.prompt("Copy this link:", text);
    }
  }

  return (
    <button type="button" onClick={copy} aria-label={label} className={quietButton}>
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/** What InviteManager needs to know about an invite (team and organization invites both have it). */
interface InviteLike {
  id: number;
  email: string;
  token: string;
  expiresAt: string;
}

/**
 * Invite people by email: makes a link per person, shows it to copy, and lists the invites
 * waiting to be accepted (copy again or cancel). Used for teams and for organizations, which
 * pass in their own api calls.
 */
export function InviteManager<T extends InviteLike>({
  description,
  load,
  create,
  cancel,
  onError,
}: {
  description: string;
  load: () => Promise<T[]>;
  create: (email: string) => Promise<T>;
  cancel: (inviteId: number) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [invites, setInvites] = useState<T[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  // The invite just made, so its link can be shown right away.
  const [fresh, setFresh] = useState<T | null>(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    load().then(
      (list) => {
        if (!cancelled) setInvites(list);
      },
      (error: Error) => onError(`Couldn't load the invites: ${error.message}`),
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new function on every render of the parent; loading once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      const invite = await create(email);
      // Inviting the same address again replaces the old invite.
      setInvites((list) => [invite, ...list.filter((i) => i.email !== invite.email)]);
      setFresh(invite);
      setEmail("");
    } catch (error) {
      onError(`Couldn't create the invite: ${(error as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function remove(invite: T) {
    try {
      await cancel(invite.id);
      setInvites((list) => list.filter((i) => i.id !== invite.id));
      if (fresh?.id === invite.id) setFresh(null);
    } catch (error) {
      onError(`Couldn't cancel the invite: ${(error as Error).message}`);
    }
  }

  return (
    <Card title="Invite people" description={description}>
      <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Email address to invite
        </label>
        <input
          id={id}
          type="email"
          required
          maxLength={254}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputClass} sm:flex-1`}
        />
        <button type="submit" disabled={sending} className={brandButton}>
          <Mail className="size-4" aria-hidden />
          {sending ? "Creating link..." : "Create invite link"}
        </button>
      </form>

      {fresh && (
        <div className="mt-4 rounded-lg bg-brand-soft p-3">
          <p className="text-sm font-medium text-brand">Invite link for {fresh.email}. Copy it and send it to them:</p>
          <CopyLink link={inviteLink(fresh.token)} />
        </div>
      )}

      {invites.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">Waiting to join</h3>
          <ul className="mt-1 divide-y divide-line">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{invite.email}</p>
                  <p className="text-xs text-muted">Link works until {formatDateTime(invite.expiresAt)}</p>
                </div>
                <CopyButton text={inviteLink(invite.token)} label={`Copy the invite link for ${invite.email}`} />
                <button
                  type="button"
                  onClick={() => remove(invite)}
                  aria-label={`Cancel the invite for ${invite.email}`}
                  className="rounded-md p-1.5 text-muted hover:bg-high-bg hover:text-high"
                >
                  <Trash className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
