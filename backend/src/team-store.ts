import type { Client, InStatement } from "@libsql/client";
import { normalizeEmail } from "./account-store.js";
import { newToken } from "./passwords.js";
import { NOW } from "./task-store.js";
import type { Invite, InvitePreview, Member, TeamRole, TeamSummary } from "./types.js";

/** How long an invite link works. */
export const INVITE_DAYS = 7;

interface TeamRow {
  id: number;
  name: string;
  personal: number;
  organization_id: number | null;
  role: TeamRole;
  // 1 = you may manage the team. (NULL counts as no: SQL gives NULL when one side is unknown.)
  can_manage: number | null;
}

interface MemberRow {
  id: number;
  name: string;
  email: string;
  role: TeamRole;
  joined_at: string;
  avatar_updated_at: string | null;
}

interface InviteRow {
  id: number;
  team_id: number;
  email: string;
  token: string;
  invited_by_name: string;
  team_name: string;
  created_at: string;
  expires_at: string;
}

function toTeam(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    personal: row.personal === 1,
    role: row.role,
    canManage: Number(row.can_manage) === 1,
    organizationId: row.organization_id,
  };
}

// A team as one member sees it. You may manage it when you own it, or when you're an
// admin of the organization it belongs to (the LEFT JOIN finds that, if there is one).
const TEAM_SELECT = `
  SELECT teams.id, teams.name, teams.personal, teams.organization_id, team_members.role,
         (team_members.role = 'owner' OR organization_members.role = 'admin') AS can_manage
  FROM team_members
  JOIN teams ON teams.id = team_members.team_id
  LEFT JOIN organization_members
    ON organization_members.organization_id = teams.organization_id
   AND organization_members.user_id = team_members.user_id`;

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
    avatarUpdatedAt: row.avatar_updated_at,
  };
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    token: row.token,
    invitedBy: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// The columns every invite query returns (with the inviter's and the team's names).
const INVITE_SELECT = `
  SELECT invites.*, users.name AS invited_by_name, teams.name AS team_name
  FROM invites
  JOIN users ON users.id = invites.invited_by
  JOIN teams ON teams.id = invites.team_id`;

/**
 * All database reads and writes for teams, their members and invites.
 * Routes check who is allowed to do what (e.g. only owners invite); this class just does it.
 */
export class TeamStore {
  constructor(private readonly db: Client) {}

  /** The teams a user belongs to: their personal team first, then the others by name. */
  async teamsFor(userId: number): Promise<TeamSummary[]> {
    const { rows } = await this.db.execute({
      sql: `${TEAM_SELECT}
            WHERE team_members.user_id = ?
            ORDER BY teams.personal DESC, teams.name COLLATE NOCASE, teams.id`,
      args: [userId],
    });
    return (rows as unknown as TeamRow[]).map(toTeam);
  }

  /** The team as this user sees it, or undefined if they aren't in it. */
  async membership(teamId: number, userId: number): Promise<TeamSummary | undefined> {
    const { rows } = await this.db.execute({
      sql: `${TEAM_SELECT} WHERE team_members.team_id = ? AND team_members.user_id = ?`,
      args: [teamId, userId],
    });
    const row = rows[0] as unknown as TeamRow | undefined;
    return row && toTeam(row);
  }

  /** The user's personal team (every account has exactly one). */
  async personalTeam(userId: number): Promise<TeamSummary> {
    const teams = await this.teamsFor(userId);
    return teams.find((team) => team.personal)!;
  }

  /** Creates a team with this user as its owner, on its own or in an organization. */
  async create(name: string, ownerId: number, organizationId: number | null = null): Promise<TeamSummary> {
    const [team] = await this.db.batch(
      [
        {
          sql: "INSERT INTO teams (name, personal, organization_id) VALUES (?, 0, ?)",
          args: [name.trim(), organizationId],
        },
        // last_insert_rowid() is the id of the team inserted just above.
        { sql: "INSERT INTO team_members (team_id, user_id, role) VALUES (last_insert_rowid(), ?, 'owner')", args: [ownerId] },
      ],
      "write",
    );
    return (await this.membership(Number(team.lastInsertRowid), ownerId))!;
  }

  async rename(teamId: number, name: string): Promise<void> {
    await this.db.execute({ sql: "UPDATE teams SET name = ? WHERE id = ?", args: [name.trim(), teamId] });
  }

  /**
   * Moves a team into an organization (or out of it, with null). Everyone in the team
   * becomes a member of the new organization, because an organization's teams only have
   * organization members in them.
   */
  async setOrganization(teamId: number, organizationId: number | null): Promise<void> {
    const statements: InStatement[] = [
      { sql: "UPDATE teams SET organization_id = ? WHERE id = ?", args: [organizationId, teamId] },
    ];
    if (organizationId !== null) {
      statements.push({
        sql: `INSERT OR IGNORE INTO organization_members (organization_id, user_id, role)
              SELECT ?, user_id, 'member' FROM team_members WHERE team_id = ?`,
        args: [organizationId, teamId],
      });
    }
    await this.db.batch(statements, "write");
  }

  /** Adds someone to a team as a member (if they aren't in it already). */
  async addMember(teamId: number, userId: number): Promise<void> {
    await this.db.execute({
      sql: "INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
      args: [teamId, userId],
    });
  }

  /** Deletes a team and everything in it (tasks, subtasks, goals, time, members, invites). */
  async delete(teamId: number): Promise<void> {
    // We delete the child rows ourselves (foreign key checks aren't switched on).
    const statements: InStatement[] = [
      "DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE team_id = ?)",
      "DELETE FROM time_entries WHERE team_id = ?",
      "DELETE FROM tasks WHERE team_id = ?",
      "DELETE FROM goals WHERE team_id = ?",
      "DELETE FROM invites WHERE team_id = ?",
      "DELETE FROM team_members WHERE team_id = ?",
      "DELETE FROM teams WHERE id = ?",
    ].map((sql) => ({ sql, args: [teamId] }));
    await this.db.batch(statements, "write");
  }

  /** Everyone in the team: owners first, then by name. */
  async members(teamId: number): Promise<Member[]> {
    const { rows } = await this.db.execute({
      sql: `SELECT users.id, users.name, users.email, users.avatar_updated_at, team_members.role, team_members.joined_at
            FROM team_members JOIN users ON users.id = team_members.user_id
            WHERE team_members.team_id = ?
            ORDER BY team_members.role = 'owner' DESC, users.name COLLATE NOCASE, users.id`,
      args: [teamId],
    });
    return (rows as unknown as MemberRow[]).map(toMember);
  }

  async isMember(teamId: number, userId: number): Promise<boolean> {
    return (await this.membership(teamId, userId)) !== undefined;
  }

  /** Removes someone from a team. Tasks assigned to them become unassigned. */
  async removeMember(teamId: number, userId: number): Promise<void> {
    await this.db.batch(
      [
        { sql: "UPDATE tasks SET assignee_id = NULL WHERE team_id = ? AND assignee_id = ?", args: [teamId, userId] },
        { sql: "DELETE FROM team_members WHERE team_id = ? AND user_id = ?", args: [teamId, userId] },
      ],
      "write",
    );
  }

  /** Invites that haven't been used and haven't run out, newest first. */
  async invites(teamId: number): Promise<Invite[]> {
    const { rows } = await this.db.execute({
      sql: `${INVITE_SELECT} WHERE invites.team_id = ? AND invites.expires_at > ${NOW}
            ORDER BY invites.created_at DESC, invites.id DESC`,
      args: [teamId],
    });
    return (rows as unknown as InviteRow[]).map(toInvite);
  }

  /**
   * Invites an email address to a team. Inviting the same address again replaces the
   * old invite (its link stops working), so there's only ever one per person.
   */
  async createInvite(teamId: number, email: string, invitedBy: number): Promise<Invite> {
    const address = normalizeEmail(email);
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const token = newToken();
    await this.db.batch(
      [
        { sql: "DELETE FROM invites WHERE team_id = ? AND email = ?", args: [teamId, address] },
        {
          sql: "INSERT INTO invites (team_id, email, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)",
          args: [teamId, address, token, invitedBy, expiresAt],
        },
      ],
      "write",
    );
    return (await this.inviteByToken(token))!.invite;
  }

  /** The invite behind a link, or undefined if it doesn't exist or has run out. */
  async inviteByToken(token: string): Promise<{ invite: Invite; preview: InvitePreview } | undefined> {
    const { rows } = await this.db.execute({
      sql: `${INVITE_SELECT} WHERE invites.token = ? AND invites.expires_at > ${NOW}`,
      args: [token],
    });
    const row = rows[0] as unknown as InviteRow | undefined;
    if (!row) return undefined;
    return {
      invite: toInvite(row),
      preview: {
        kind: "team",
        name: row.team_name,
        email: row.email,
        invitedBy: row.invited_by_name,
        expiresAt: row.expires_at,
      },
    };
  }

  /** Cancels an invite. Returns false if the team has no such invite. */
  async deleteInvite(teamId: number, inviteId: number): Promise<boolean> {
    const { rowsAffected } = await this.db.execute({
      sql: "DELETE FROM invites WHERE id = ? AND team_id = ?",
      args: [inviteId, teamId],
    });
    return rowsAffected > 0;
  }

  /**
   * Adds the user to the invite's team as a member, and uses up the invite. If the team is
   * in an organization, they join the organization too.
   */
  async acceptInvite(invite: Invite, userId: number): Promise<TeamSummary> {
    await this.db.batch(
      [
        // OR IGNORE: if they're already in the team, nothing changes.
        {
          sql: "INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
          args: [invite.teamId, userId],
        },
        {
          sql: `INSERT OR IGNORE INTO organization_members (organization_id, user_id, role)
                SELECT organization_id, ?, 'member' FROM teams WHERE id = ? AND organization_id IS NOT NULL`,
          args: [userId, invite.teamId],
        },
        { sql: "DELETE FROM invites WHERE id = ?", args: [invite.id] },
      ],
      "write",
    );
    return (await this.membership(invite.teamId, userId))!;
  }
}
