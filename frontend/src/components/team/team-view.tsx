"use client";

import { Check, Copy, Crown, LogOut, Mail, Pencil, Plus, Trash, Users, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Avatar } from "@/components/layout/avatar";
import { ErrorToast } from "@/components/tasks/feedback";
import { useAuth } from "@/hooks/auth-context";
import { useTaskList } from "@/hooks/tasks-context";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/task-helpers";
import type { Invite, Member, TeamSummary } from "@/lib/types";

const inputClass =
  "w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";
const brandButton =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-hover disabled:opacity-60";
const quietButton =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand ring-1 ring-line hover:bg-brand-soft disabled:opacity-60";

/** The address an invite link opens. Only called in the browser (invites load after the page does). */
function inviteLink(invite: Invite): string {
  return `${window.location.origin}/invite/${invite.token}`;
}

/**
 * The Team page. In your personal space: what teams are, and a form to create one.
 * In a team: its members, invites (owner only), and leaving / deleting it.
 */
export function TeamView() {
  const { team } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {team.personal ? <PersonalIntro /> : <TeamDetails team={team} onError={setToast} />}
      <CreateTeam onError={setToast} />
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

function Card({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Shown in your personal space: explains teams and lists the ones you're in. */
function PersonalIntro() {
  const { teams, switchTeam } = useAuth();
  const others = teams.filter((t) => !t.personal);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re in your <strong className="font-medium text-ink">personal space</strong>: only you can see
          its tasks and goals. A team has its own shared tasks, goals and calendar. Invite people, then assign
          tasks to them.
        </p>
      </div>
      <Card title="Your teams" description="Open one here, or with the Space menu in the sidebar.">
        {others.length === 0 ? (
          <p className="text-sm text-muted">You&apos;re not in any team yet. Create one below, or ask someone to invite you.</p>
        ) : (
          <ul className="divide-y divide-line">
            {others.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Users className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.role === "owner" ? "You own this team" : "Member"}</p>
                </div>
                <button type="button" onClick={() => switchTeam(t.id)} className={quietButton}>
                  Open<span className="sr-only"> {t.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** A team's name, members, invites and the leave / delete buttons. */
function TeamDetails({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const { members } = useTaskList();
  const owner = team.role === "owner";

  return (
    <>
      <TeamHeader team={team} memberCount={members.length} onError={onError} />
      <MembersCard team={team} onError={onError} />
      {owner && <InvitesCard team={team} onError={onError} />}
      <DangerZone team={team} onError={onError} />
    </>
  );
}

function TeamHeader({ team, memberCount, onError }: { team: TeamSummary; memberCount: number; onError: (message: string) => void }) {
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const id = useId();

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.renameTeam(team.id, name);
      await refresh();
      setEditing(false);
    } catch (error) {
      onError(`Couldn't rename the team: ${(error as Error).message}`);
    }
  }

  if (editing) {
    return (
      <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="w-full text-sm font-medium">
          Team name
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={60}
          autoFocus
          className={`${inputClass} flex-1 sm:max-w-sm`}
        />
        <button type="submit" className={brandButton}>
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setName(team.name);
            setEditing(false);
          }}
          className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-page hover:text-ink"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-2xl font-semibold">{team.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {memberCount} {memberCount === 1 ? "member" : "members"} · Tasks, goals and the calendar here are shared
          with the whole team. Tracked time stays your own.
        </p>
      </div>
      {team.role === "owner" && (
        <button type="button" onClick={() => setEditing(true)} className={quietButton}>
          <Pencil className="size-4" aria-hidden />
          Rename
        </button>
      )}
    </div>
  );
}

function MembersCard({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const { user } = useAuth();
  const { members, reloadMembers, loadState } = useTaskList();
  const owner = team.role === "owner";

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.name} from ${team.name}? Tasks assigned to them become unassigned.`)) return;
    try {
      await api.removeMember(team.id, member.id);
      await reloadMembers();
    } catch (error) {
      onError(`Couldn't remove ${member.name}: ${(error as Error).message}`);
    }
  }

  return (
    <Card title="Members">
      {loadState === "loading" ? (
        <p className="text-sm text-muted" role="status">
          Loading members...
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.id === user.id && <span className="font-normal text-muted"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>
              {member.role === "owner" ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-mid-bg px-2 py-0.5 text-xs font-medium text-mid">
                  <Crown className="size-3" aria-hidden />
                  Owner
                </span>
              ) : (
                owner && (
                  <button
                    type="button"
                    onClick={() => remove(member)}
                    aria-label={`Remove ${member.name} from the team`}
                    className="rounded-md p-1.5 text-muted hover:bg-high-bg hover:text-high"
                  >
                    <X className="size-4" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Owner only: invite someone by email, and see / copy / cancel invites that are waiting. */
function InvitesCard({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  // The invite just made, so its link can be shown right away.
  const [fresh, setFresh] = useState<Invite | null>(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    api.listInvites(team.id).then(
      (list) => {
        if (!cancelled) setInvites(list);
      },
      (error: Error) => onError(`Couldn't load the invites: ${error.message}`),
    );
    return () => {
      cancelled = true;
    };
  }, [team.id, onError]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      const invite = await api.createInvite(team.id, email);
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

  async function cancel(invite: Invite) {
    try {
      await api.deleteInvite(team.id, invite.id);
      setInvites((list) => list.filter((i) => i.id !== invite.id));
      if (fresh?.id === invite.id) setFresh(null);
    } catch (error) {
      onError(`Couldn't cancel the invite: ${(error as Error).message}`);
    }
  }

  return (
    <Card
      title="Invite people"
      description="DoSprout makes a link for each person. Send it to them yourself (email, WhatsApp, Slack...). It works once, for 7 days, and only for that email address."
    >
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
          <CopyLink link={inviteLink(fresh)} />
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
                <CopyButton text={inviteLink(invite)} label={`Copy the invite link for ${invite.email}`} />
                <button
                  type="button"
                  onClick={() => cancel(invite)}
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

/** The link in a box you can select, plus a Copy button. */
function CopyLink({ link }: { link: string }) {
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

function CopyButton({ text, label }: { text: string; label: string }) {
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

/** Owners can delete the team; members can leave it. */
function DangerZone({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const { user, refresh } = useAuth();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function leave() {
    if (!window.confirm(`Leave ${team.name}? You'll need a new invite to come back.`)) return;
    setBusy(true);
    try {
      await api.removeMember(team.id, user.id);
      await refresh(); // The team is gone from your list, so your personal space opens.
    } catch (error) {
      onError(`Couldn't leave the team: ${(error as Error).message}`);
      setBusy(false);
    }
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (typed !== team.name) return;
    setBusy(true);
    try {
      await api.deleteTeam(team.id);
      await refresh();
    } catch (error) {
      onError(`Nothing was deleted: ${(error as Error).message}`);
      setBusy(false);
    }
  }

  if (team.role !== "owner") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="min-w-0 flex-1 text-sm text-muted">Leaving removes you from the team. Your tasks there stay with the team.</p>
        <button type="button" onClick={leave} disabled={busy} className={quietButton}>
          <LogOut className="size-4" aria-hidden />
          Leave team
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={remove} className="rounded-xl border border-high/40 bg-high-bg px-4 py-3 sm:px-5">
      <p className="text-sm font-medium text-high">Delete this team</p>
      <p className="text-xs text-muted">
        Deletes the team with all its tasks, goals and tracked time, for everyone. It can&apos;t be undone (download a
        backup in Settings first if you might want them back).
      </p>
      <label htmlFor={id} className="mt-3 block text-sm">
        Type <span className="font-medium">{team.name}</span> to confirm
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={`${inputClass} sm:flex-1`}
        />
        <button
          type="submit"
          disabled={typed !== team.name || busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-high px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Trash className="size-4" aria-hidden />
          {busy ? "Deleting..." : "Delete team"}
        </button>
      </div>
    </form>
  );
}

/** Anyone can create a team; they become its owner and it opens right away. */
function CreateTeam({ onError }: { onError: (message: string) => void }) {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const team = await api.createTeam(name);
      setName("");
      await refresh(team.id);
    } catch (error) {
      onError(`Couldn't create the team: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="new-team" title="Create a team" description="You'll be its owner. Then invite people from this page.">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Team name
        </label>
        <input
          id={id}
          required
          maxLength={60}
          placeholder="e.g. Marketing, Family, Study group"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} sm:flex-1`}
        />
        <button type="submit" disabled={busy} className={brandButton}>
          <Plus className="size-4" aria-hidden />
          {busy ? "Creating..." : "Create team"}
        </button>
      </form>
    </Card>
  );
}
