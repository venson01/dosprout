"use client";

import { Building2, LogOut, Pencil, Plus, ShieldCheck, Trash, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Avatar } from "@/components/layout/avatar";
import { ErrorToast, LoadingSkeleton } from "@/components/tasks/feedback";
import { brandButton, Card, dangerButton, InviteManager, inputClass, quietButton } from "@/components/team/team-ui";
import { useAuth } from "@/hooks/auth-context";
import { api } from "@/lib/api";
import type { OrganizationDetails, OrganizationMember, OrganizationSummary } from "@/lib/types";

type OnError = (message: string) => void;

/**
 * The Organization page: a group of teams with admins and members. Shows the organization
 * of the team you're in (or your first one; a picker when you're in several): all its teams
 * with how much is open and overdue, the member directory, invites (admins) and leaving /
 * deleting it. Without an organization: what they are, and a form to create one.
 */
export function OrganizationView() {
  const { team, organizations, refresh } = useAuth();
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const selected =
    organizations.find((o) => o.id === chosenId) ??
    organizations.find((o) => o.id === team.organizationId) ??
    organizations[0];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {selected ? (
        // key: start fresh (load again) when another organization is picked.
        <OrganizationDetailsView key={selected.id} organization={selected} onPick={setChosenId} onError={setToast} />
      ) : (
        <Intro />
      )}
      <CreateOrganization
        onCreated={async (id) => {
          await refresh();
          setChosenId(id);
        }}
        onError={setToast}
      />
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

function Intro() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Organizations</h1>
      <p className="mt-1 text-sm text-muted">
        An organization groups your company&apos;s (or club&apos;s) teams. Admins see every team with its open and
        overdue work, invite people once and add them to any team, and can remove someone from all teams in one
        step. You&apos;re not in an organization yet: create one below, or ask an admin to invite you.
      </p>
    </div>
  );
}

function OrganizationDetailsView({
  organization,
  onPick,
  onError,
}: {
  organization: OrganizationSummary;
  onPick: (id: number) => void;
  onError: OnError;
}) {
  const { organizations } = useAuth();
  const [details, setDetails] = useState<OrganizationDetails | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const admin = organization.role === "admin";
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api.getOrganization(organization.id).then(
      (loaded) => {
        if (!cancelled) setDetails(loaded);
      },
      (error: Error) => onError(`Couldn't load ${organization.name}: ${error.message}`),
    );
    return () => {
      cancelled = true;
    };
  }, [organization.id, organization.name, reloadKey, onError]);

  return (
    <>
      <Header organization={organization} onError={onError} />
      {organizations.length > 1 && <Picker current={organization.id} onPick={onPick} />}
      {details === null ? (
        <LoadingSkeleton label={`Loading ${organization.name}`} />
      ) : (
        <>
          <Numbers details={details} />
          <TeamsCard details={details} onChanged={reload} onError={onError} />
          <MembersCard details={details} onChanged={reload} onError={onError} />
          {admin && (
            <InviteManager
              description={`DoSprout makes a link for each person; send it to them yourself. It works once, for 7 days, and only for that email address. Once they're in ${organization.name}, you (or a team's owner) can add them to teams without another link.`}
              load={() => api.listOrganizationInvites(organization.id)}
              create={(email) => api.createOrganizationInvite(organization.id, email)}
              cancel={(inviteId) => api.deleteOrganizationInvite(organization.id, inviteId)}
              onError={onError}
            />
          )}
          <DangerZone organization={organization} onError={onError} />
        </>
      )}
    </>
  );
}

function Header({ organization, onError }: { organization: OrganizationSummary; onError: OnError }) {
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const id = useId();

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.renameOrganization(organization.id, name);
      await refresh();
      setEditing(false);
    } catch (error) {
      onError(`Couldn't rename the organization: ${(error as Error).message}`);
    }
  }

  if (editing) {
    return (
      <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="w-full text-sm font-medium">
          Organization name
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          autoFocus
          className={`${inputClass} flex-1 sm:max-w-sm`}
        />
        <button type="submit" className={brandButton}>
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setName(organization.name);
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
        <h1 className="flex items-center gap-2 break-words text-2xl font-semibold">
          <Building2 className="size-6 shrink-0 text-brand" aria-hidden />
          {organization.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {organization.role === "admin"
            ? "You're an admin: you can manage every team here, invite people and remove them."
            : "You're a member. Admins manage the organization; you work in its teams."}
        </p>
      </div>
      {organization.role === "admin" && (
        <button type="button" onClick={() => setEditing(true)} className={quietButton}>
          <Pencil className="size-4" aria-hidden />
          Rename
        </button>
      )}
    </div>
  );
}

/** When you're in several organizations: which one to show. */
function Picker({ current, onPick }: { current: number; onPick: (id: number) => void }) {
  const { organizations } = useAuth();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted">
        Showing
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => onPick(Number(e.target.value))}
        className={`${inputClass} w-auto max-w-full`}
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Four numbers at a glance. */
function Numbers({ details }: { details: OrganizationDetails }) {
  const open = details.teams.reduce((sum, t) => sum + t.openTaskCount, 0);
  const overdue = details.teams.reduce((sum, t) => sum + t.overdueTaskCount, 0);
  const tiles = [
    { label: "Teams", value: details.teams.length, alert: false },
    { label: "Members", value: details.members.length, alert: false },
    { label: "Open tasks", value: open, alert: false },
    { label: "Overdue", value: overdue, alert: overdue > 0 },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">{tile.label}</dt>
          <dd className={`mt-1 text-2xl font-semibold ${tile.alert ? "text-high" : ""}`}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Every team in the organization, with its numbers; open, join (admins) or create one. */
function TeamsCard({ details, onChanged, onError }: { details: OrganizationDetails; onChanged: () => void; onError: OnError }) {
  const router = useRouter();
  const { switchTeam, refresh } = useAuth();
  const { organization } = details;
  const admin = organization.role === "admin";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  function open(teamId: number) {
    switchTeam(teamId);
    router.push("/tasks");
  }

  async function join(teamId: number) {
    try {
      await api.joinOrganizationTeam(organization.id, teamId);
      await refresh(); // It's in your Space menu now.
      onChanged();
    } catch (error) {
      onError(`Couldn't join the team: ${(error as Error).message}`);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createTeam(name, organization.id);
      setName("");
      await refresh();
      onChanged();
    } catch (error) {
      onError(`Couldn't create the team: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Teams" description={admin ? "Every team in the organization. Join one to open and manage it." : undefined}>
      {details.teams.length === 0 ? (
        <p className="text-sm text-muted">No teams yet. Create the first one below.</p>
      ) : (
        <ul className="divide-y divide-line">
          {details.teams.map((team) => (
            <li key={team.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <Users className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{team.name}</p>
                <p className="text-xs text-muted">
                  {team.memberCount} {team.memberCount === 1 ? "member" : "members"} · {team.openTaskCount} open
                  {team.overdueTaskCount > 0 && (
                    <span className="font-medium text-high"> · {team.overdueTaskCount} overdue</span>
                  )}
                </p>
              </div>
              {team.isMember ? (
                <button type="button" onClick={() => open(team.id)} className={quietButton}>
                  Open<span className="sr-only"> {team.name}</span>
                </button>
              ) : admin ? (
                <button type="button" onClick={() => join(team.id)} className={quietButton}>
                  Join<span className="sr-only"> {team.name}</span>
                </button>
              ) : (
                <span className="text-xs text-muted">Not in this team</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          New team name
        </label>
        <input
          id={id}
          required
          maxLength={60}
          placeholder={`New team in ${organization.name}`}
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

/** The member directory: who's in, which teams they're in, and (admins) roles and removing. */
function MembersCard({ details, onChanged, onError }: { details: OrganizationDetails; onChanged: () => void; onError: OnError }) {
  const { user, refresh } = useAuth();
  const { organization } = details;
  const admin = organization.role === "admin";
  const teamName = (id: number) => details.teams.find((t) => t.id === id)?.name ?? "";

  async function setRole(member: OrganizationMember, role: OrganizationMember["role"]) {
    try {
      await api.setOrganizationRole(organization.id, member.id, role);
      onChanged();
    } catch (error) {
      onError(`Couldn't change ${member.name}'s role: ${(error as Error).message}`);
    }
  }

  async function remove(member: OrganizationMember) {
    const question =
      `Remove ${member.name} from ${organization.name}? They'll be taken out of all its teams, ` +
      "tasks assigned to them there become unassigned, and teams they own are handed to you.";
    if (!window.confirm(question)) return;
    try {
      await api.removeOrganizationMember(organization.id, member.id);
      await refresh(); // You may now own teams you didn't before.
      onChanged();
    } catch (error) {
      onError(`Couldn't remove ${member.name}: ${(error as Error).message}`);
    }
  }

  return (
    <Card title="Members">
      <ul className="divide-y divide-line">
        {details.members.map((member) => {
          const isYou = member.id === user.id;
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {isYou && <span className="font-normal text-muted"> (you)</span>}
                  {member.role === "admin" && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-mid-bg px-2 py-0.5 align-middle text-xs font-medium text-mid">
                      <ShieldCheck className="size-3" aria-hidden />
                      Admin
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {member.teamIds.length === 0 ? (
                    <span className="text-xs text-muted">Not in a team yet</span>
                  ) : (
                    member.teamIds.map((teamId) => (
                      <span key={teamId} className="rounded-md bg-tag-bg px-2 py-0.5 text-xs text-tag">
                        {teamName(teamId)}
                      </span>
                    ))
                  )}
                </p>
              </div>
              {admin && !isYou && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRole(member, member.role === "admin" ? "member" : "admin")}
                    className={quietButton}
                  >
                    {member.role === "admin" ? "Make member" : "Make admin"}
                    <span className="sr-only"> ({member.name})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(member)}
                    aria-label={`Remove ${member.name} from the organization`}
                    className="rounded-md p-1.5 text-muted hover:bg-high-bg hover:text-high"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Everyone can leave (the server keeps at least one admin); admins can delete it. */
function DangerZone({ organization, onError }: { organization: OrganizationSummary; onError: OnError }) {
  const { user, refresh } = useAuth();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function leave() {
    const question =
      `Leave ${organization.name}? You'll be taken out of all its teams` +
      " (teams you own are handed to an admin). You'll need a new invite to come back.";
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await api.removeOrganizationMember(organization.id, user.id);
      await refresh();
    } catch (error) {
      onError(`Couldn't leave: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (typed !== organization.name) return;
    setBusy(true);
    try {
      await api.deleteOrganization(organization.id);
      await refresh();
    } catch (error) {
      onError(`Nothing was deleted: ${(error as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="min-w-0 flex-1 text-sm text-muted">Leaving takes you out of the organization and all its teams.</p>
        <button type="button" onClick={leave} disabled={busy} className={quietButton}>
          <LogOut className="size-4" aria-hidden />
          Leave organization
        </button>
      </div>

      {organization.role === "admin" && (
        <form onSubmit={remove} className="rounded-xl border border-high/40 bg-high-bg px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-high">Delete this organization</p>
          <p className="text-xs text-muted">
            Its teams are NOT deleted: they carry on on their own, with the same owners, members and tasks. Only the
            organization (its admins, member list and invites) goes.
          </p>
          <label htmlFor={id} className="mt-3 block text-sm">
            Type <span className="font-medium">{organization.name}</span> to confirm
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className={`${inputClass} sm:flex-1`}
            />
            <button type="submit" disabled={typed !== organization.name || busy} className={dangerButton}>
              <Trash className="size-4" aria-hidden />
              {busy ? "Deleting..." : "Delete organization"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/** Anyone can create an organization; they become its admin. */
function CreateOrganization({ onCreated, onError }: { onCreated: (id: number) => Promise<void>; onError: OnError }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const organization = await api.createOrganization(name);
      setName("");
      await onCreated(organization.id);
    } catch (error) {
      onError(`Couldn't create the organization: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="new-organization"
      title="Create an organization"
      description="You'll be its admin. Then create teams in it, or move your existing teams in from their Team page."
    >
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Organization name
        </label>
        <input
          id={id}
          required
          maxLength={80}
          placeholder="e.g. Acme Inc."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} sm:flex-1`}
        />
        <button type="submit" disabled={busy} className={brandButton}>
          <Plus className="size-4" aria-hidden />
          {busy ? "Creating..." : "Create organization"}
        </button>
      </form>
    </Card>
  );
}
