"use client";

import { Building2, Crown, LogOut, Pencil, Plus, Trash, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Avatar } from "@/components/layout/avatar";
import { ErrorToast } from "@/components/tasks/feedback";
import { useAuth } from "@/hooks/auth-context";
import { useTaskList } from "@/hooks/tasks-context";
import { api } from "@/lib/api";
import type { Member, OrganizationMember, TeamSummary } from "@/lib/types";
import { brandButton, Card, dangerButton, InviteManager, inputClass, quietButton } from "./team-ui";

/**
 * The Team page. In your personal space: what teams are, and a form to create one.
 * In a team: its members, its organization, invites, and leaving / deleting it.
 * "Manage" buttons show when team.canManage: you own the team, or you're an admin of
 * its organization.
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

/** Shown in your personal space: explains teams and lists the ones you're in. */
function PersonalIntro() {
  const { teams, organizations, switchTeam } = useAuth();
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
            {others.map((t) => {
              const organization = organizations.find((o) => o.id === t.organizationId);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Users className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted">
                      {t.role === "owner" ? "You own this team" : "Member"}
                      {organization && ` · ${organization.name}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => switchTeam(t.id)} className={quietButton}>
                    Open<span className="sr-only"> {t.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** A team's name, members, organization, invites and the leave / delete buttons. */
function TeamDetails({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const { members } = useTaskList();

  return (
    <>
      <TeamHeader team={team} memberCount={members.length} onError={onError} />
      <MembersCard team={team} onError={onError} />
      <OrganizationCard team={team} onError={onError} />
      {team.canManage && <InvitesCard team={team} onError={onError} />}
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
      {team.canManage && (
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
                // You leave with the "Leave team" button below, not here.
                team.canManage &&
                member.id !== user.id && (
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

/**
 * Which organization the team belongs to. Managers of a team in an organization can add
 * colleagues straight away; admins can move the team into (or out of) an organization.
 */
function OrganizationCard({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  const { organizations, refresh } = useAuth();
  const { members, reloadMembers } = useTaskList();
  const current = organizations.find((o) => o.id === team.organizationId);
  // Moving needs admin rights in the organization it leaves AND the one it joins.
  const mayLeaveCurrent = team.organizationId === null || current?.role === "admin";
  const destinations = mayLeaveCurrent ? organizations.filter((o) => o.role === "admin" && o.id !== team.organizationId) : [];
  const canMove = team.canManage && mayLeaveCurrent && (destinations.length > 0 || team.organizationId !== null);
  const canAddColleagues = team.canManage && team.organizationId !== null;

  const [colleagues, setColleagues] = useState<OrganizationMember[]>([]);
  const [colleagueId, setColleagueId] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();

  // The organization's members, to pick colleagues from.
  useEffect(() => {
    if (!canAddColleagues || team.organizationId === null) return;
    let cancelled = false;
    api.getOrganization(team.organizationId).then(
      (details) => {
        if (!cancelled) setColleagues(details.members);
      },
      (error: Error) => onError(`Couldn't load the organization's members: ${error.message}`),
    );
    return () => {
      cancelled = true;
    };
  }, [canAddColleagues, team.organizationId, onError]);

  // Only people who aren't in the team yet.
  const addable = colleagues.filter((c) => !members.some((m) => m.id === c.id));

  async function addColleague(event: React.FormEvent) {
    event.preventDefault();
    if (!colleagueId) return;
    setBusy(true);
    try {
      await api.addTeamMember(team.id, Number(colleagueId));
      await reloadMembers();
      setColleagueId("");
    } catch (error) {
      onError(`Couldn't add them: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function move(event: React.FormEvent) {
    event.preventDefault();
    if (!destination) return;
    const target = destination === "none" ? null : organizations.find((o) => o.id === Number(destination));
    const question =
      target === null
        ? `Take ${team.name} out of ${current?.name}? It carries on as a team on its own.`
        : `Move ${team.name} into ${target?.name}? Everyone in the team becomes a member of ${target?.name}.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await api.moveTeam(team.id, target === null ? null : target!.id);
      setDestination("");
      await refresh();
    } catch (error) {
      onError(`Couldn't move the team: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!current && !canMove) return null;

  return (
    <Card
      title="Organization"
      description={current ? `This team is part of ${current.name}.` : "This team is on its own, not part of an organization."}
    >
      <div className="space-y-4">
        {current && (
          <Link href="/organization" className={quietButton}>
            <Building2 className="size-4" aria-hidden />
            Open {current.name}
          </Link>
        )}

        {canAddColleagues && (
          <form onSubmit={addColleague}>
            <label htmlFor={`${ids}-colleague`} className="mb-1 block text-sm font-medium">
              Add someone from {current?.name ?? "the organization"} (no invite needed)
            </label>
            {addable.length === 0 ? (
              <p className="text-sm text-muted">Everyone in the organization is already in this team.</p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id={`${ids}-colleague`}
                  value={colleagueId}
                  onChange={(e) => setColleagueId(e.target.value)}
                  className={`${inputClass} sm:flex-1`}
                >
                  <option value="">Pick a colleague...</option>
                  {addable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy || !colleagueId} className={brandButton}>
                  <UserPlus className="size-4" aria-hidden />
                  Add to team
                </button>
              </div>
            )}
          </form>
        )}

        {canMove && (
          <form onSubmit={move}>
            <label htmlFor={`${ids}-move`} className="mb-1 block text-sm font-medium">
              {current ? "Move this team" : "Move this team into an organization"}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id={`${ids}-move`}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className={`${inputClass} sm:flex-1`}
              >
                <option value="">Pick where...</option>
                {destinations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                {current && <option value="none">Out of {current.name} (on its own)</option>}
              </select>
              <button type="submit" disabled={busy || !destination} className={quietButton}>
                Move team
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Managers only: invite someone by email, and see / copy / cancel invites that are waiting. */
function InvitesCard({ team, onError }: { team: TeamSummary; onError: (message: string) => void }) {
  return (
    <InviteManager
      description={`DoSprout makes a link for each person. Send it to them yourself (email, WhatsApp, Slack...). It works once, for 7 days, and only for that email address.${
        team.organizationId !== null ? " Joining this team also makes them a member of its organization." : ""
      }`}
      load={() => api.listInvites(team.id)}
      create={(email) => api.createInvite(team.id, email)}
      cancel={(inviteId) => api.deleteInvite(team.id, inviteId)}
      onError={onError}
    />
  );
}

/**
 * Leaving (anyone but the owner) and deleting (managers). An organization admin who joined
 * the team sees both.
 */
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

  return (
    <>
      {team.role !== "owner" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:px-5">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Leaving removes you from the team. Your tasks there stay with the team.
          </p>
          <button type="button" onClick={leave} disabled={busy} className={quietButton}>
            <LogOut className="size-4" aria-hidden />
            Leave team
          </button>
        </div>
      )}

      {team.canManage && (
        <form onSubmit={remove} className="rounded-xl border border-high/40 bg-high-bg px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-high">Delete this team</p>
          <p className="text-xs text-muted">
            Deletes the team with all its tasks, goals and tracked time, for everyone. It can&apos;t be undone
            (download a backup in Settings first if you might want them back).
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
            <button type="submit" disabled={typed !== team.name || busy} className={dangerButton}>
              <Trash className="size-4" aria-hidden />
              {busy ? "Deleting..." : "Delete team"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/** Anyone can create a team (on its own or in one of their organizations); it opens right away. */
function CreateTeam({ onError }: { onError: (message: string) => void }) {
  const { team: currentTeam, organizations, refresh } = useAuth();
  const [name, setName] = useState("");
  // Starts with the current team's organization (handy when adding teams to a company).
  const [organizationId, setOrganizationId] = useState(currentTeam.organizationId ? String(currentTeam.organizationId) : "");
  const [busy, setBusy] = useState(false);
  const ids = useId();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const team = await api.createTeam(name, organizationId ? Number(organizationId) : null);
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
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label htmlFor={`${ids}-name`} className="sr-only">
          Team name
        </label>
        <input
          id={`${ids}-name`}
          required
          maxLength={60}
          placeholder="e.g. Marketing, Family, Study group"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} sm:flex-1`}
        />
        {organizations.length > 0 && (
          <>
            <label htmlFor={`${ids}-organization`} className="sr-only">
              Organization
            </label>
            <select
              id={`${ids}-organization`}
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={`${inputClass} sm:w-auto sm:max-w-56`}
            >
              <option value="">No organization</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  In {o.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="submit" disabled={busy} className={brandButton}>
          <Plus className="size-4" aria-hidden />
          {busy ? "Creating..." : "Create team"}
        </button>
      </form>
    </Card>
  );
}
