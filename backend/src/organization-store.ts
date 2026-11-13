import type { Client, InStatement } from "@libsql/client";
import { normalizeEmail } from "./account-store.js";
import { newToken } from "./passwords.js";
import { NOW } from "./task-store.js";
import { INVITE_DAYS } from "./team-store.js";
import type {
  InvitePreview,
  OrganizationDetails,
  OrganizationInvite,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  OrganizationTeam,
} from "./types.js";

interface OrganizationRow {
  id: number;
  name: string;
  role: OrganizationRole;
}

interface OrganizationTeamRow {
  id: number;
  name: string;
  member_count: number;
  open_task_count: number;
  overdue_task_count: number;
  is_member: number;
}

interface MemberRow {
  id: number;
  name: string;
  email: string;
  role: OrganizationRole;
  joined_at: string;
  avatar_updated_at: string | null;
}

interface InviteRow {
  id: number;
  organization_id: number;
  email: string;
  token: string;
  invited_by_name: string;
  organization_name: string;
  created_at: string;
  expires_at: string;
}

function toOrganization(row: OrganizationRow): OrganizationSummary {
  return { id: row.id, name: row.name, role: row.role };
}

function toInvite(row: InviteRow): OrganizationInvite {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    token: row.token,
    invitedBy: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// An organization as one member sees it (with their role).
const ORGANIZATION_SELECT = `
  SELECT organizations.id, organizations.name, organization_members.role
  FROM organization_members
  JOIN organizations ON organizations.id = organization_members.organization_id`;

// Every invite query returns the inviter's and the organization's names too.
const INVITE_SELECT = `
  SELECT organization_invites.*, users.name AS invited_by_name, organizations.name AS organization_name
  FROM organization_invites
  JOIN users ON users.id = organization_invites.invited_by
  JOIN organizations ON organizations.id = organization_invites.organization_id`;

// The ids of an organization's teams. Needs the organization id as its "?" argument.
const ORGANIZATION_TEAM_IDS = "(SELECT id FROM teams WHERE organization_id = ?)";

/**
 * All database reads and writes for organizations: their members, the overview of their
 * teams, and organization invites. Routes check who may do what (e.g. only admins invite).
 */
export class OrganizationStore {
  constructor(private readonly db: Client) {}

  /** The organizations a user belongs to, by name. */
  async forUser(userId: number): Promise<OrganizationSummary[]> {
    const { rows } = await this.db.execute({
      sql: `${ORGANIZATION_SELECT} WHERE organization_members.user_id = ?
            ORDER BY organizations.name COLLATE NOCASE, organizations.id`,
      args: [userId],
    });
    return (rows as unknown as OrganizationRow[]).map(toOrganization);
  }

  /** The organization as this user sees it, or undefined if they aren't in it. */
  async membership(organizationId: number, userId: number): Promise<OrganizationSummary | undefined> {
    const { rows } = await this.db.execute({
      sql: `${ORGANIZATION_SELECT}
            WHERE organization_members.organization_id = ? AND organization_members.user_id = ?`,
      args: [organizationId, userId],
    });
    const row = rows[0] as unknown as OrganizationRow | undefined;
    return row && toOrganization(row);
  }

  /** Creates an organization with this user as its (first) admin. */
  async create(name: string, userId: number): Promise<OrganizationSummary> {
    const [organization] = await this.db.batch(
      [
        { sql: "INSERT INTO organizations (name) VALUES (?)", args: [name.trim()] },
        // last_insert_rowid() is the id of the organization inserted just above.
        {
          sql: "INSERT INTO organization_members (organization_id, user_id, role) VALUES (last_insert_rowid(), ?, 'admin')",
          args: [userId],
        },
      ],
      "write",
    );
    return (await this.membership(Number(organization.lastInsertRowid), userId))!;
  }

  async rename(organizationId: number, name: string): Promise<void> {
    await this.db.execute({ sql: "UPDATE organizations SET name = ? WHERE id = ?", args: [name.trim(), organizationId] });
  }

  /**
   * Deletes an organization. Its teams are NOT deleted: they carry on as teams on their own,
   * with the same owners and members.
   */
  async delete(organizationId: number): Promise<void> {
    const statements: InStatement[] = [
      "UPDATE teams SET organization_id = NULL WHERE organization_id = ?",
      "DELETE FROM organization_invites WHERE organization_id = ?",
      "DELETE FROM organization_members WHERE organization_id = ?",
      "DELETE FROM organizations WHERE id = ?",
    ].map((sql) => ({ sql, args: [organizationId] }));
    await this.db.batch(statements, "write");
  }

  /**
   * What the Organization page shows: every team in it (with how much is open and overdue,
   * and whether `userId` is in it) and every member (with the teams they're in).
   */
  async details(organization: OrganizationSummary, userId: number): Promise<OrganizationDetails> {
    const [teamResult, memberResult, membershipResult] = await this.db.batch(
      [
        {
          sql: `SELECT teams.id, teams.name,
                  (SELECT COUNT(*) FROM team_members WHERE team_members.team_id = teams.id) AS member_count,
                  (SELECT COUNT(*) FROM tasks WHERE tasks.team_id = teams.id AND tasks.status != 'done') AS open_task_count,
                  (SELECT COUNT(*) FROM tasks WHERE tasks.team_id = teams.id AND tasks.status != 'done'
                     AND tasks.due_at < ${NOW}) AS overdue_task_count,
                  EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = teams.id
                     AND team_members.user_id = ?) AS is_member
                FROM teams WHERE teams.organization_id = ?
                ORDER BY teams.name COLLATE NOCASE, teams.id`,
          args: [userId, organization.id],
        },
        {
          sql: `SELECT users.id, users.name, users.email, users.avatar_updated_at, organization_members.role,
                       organization_members.joined_at
                FROM organization_members JOIN users ON users.id = organization_members.user_id
                WHERE organization_members.organization_id = ?
                ORDER BY organization_members.role = 'admin' DESC, users.name COLLATE NOCASE, users.id`,
          args: [organization.id],
        },
        {
          sql: `SELECT team_members.user_id, team_members.team_id FROM team_members
                WHERE team_members.team_id IN ${ORGANIZATION_TEAM_IDS}`,
          args: [organization.id],
        },
      ],
      "read",
    );

    const teamsByUser = new Map<number, number[]>();
    for (const row of membershipResult.rows) {
      const list = teamsByUser.get(Number(row.user_id)) ?? [];
      list.push(Number(row.team_id));
      teamsByUser.set(Number(row.user_id), list);
    }
    const teams: OrganizationTeam[] = (teamResult.rows as unknown as OrganizationTeamRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: Number(row.member_count),
      openTaskCount: Number(row.open_task_count),
      overdueTaskCount: Number(row.overdue_task_count),
      isMember: Number(row.is_member) === 1,
    }));
    const members: OrganizationMember[] = (memberResult.rows as unknown as MemberRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      joinedAt: row.joined_at,
      teamIds: teamsByUser.get(row.id) ?? [],
      avatarUpdatedAt: row.avatar_updated_at,
    }));
    return { organization, teams, members };
  }

  /** How many admins the organization has (there must always be at least one). */
  async adminCount(organizationId: number): Promise<number> {
    const { rows } = await this.db.execute({
      sql: "SELECT COUNT(*) AS count FROM organization_members WHERE organization_id = ? AND role = 'admin'",
      args: [organizationId],
    });
    return Number(rows[0].count);
  }

  /** The admin who has been in the organization longest, other than `exceptUserId`. */
  async longestServingAdmin(organizationId: number, exceptUserId: number): Promise<number | undefined> {
    const { rows } = await this.db.execute({
      sql: `SELECT user_id FROM organization_members
            WHERE organization_id = ? AND role = 'admin' AND user_id != ?
            ORDER BY joined_at, user_id LIMIT 1`,
      args: [organizationId, exceptUserId],
    });
    return rows[0] ? Number(rows[0].user_id) : undefined;
  }

  async setRole(organizationId: number, userId: number, role: OrganizationRole): Promise<void> {
    await this.db.execute({
      sql: "UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?",
      args: [role, organizationId, userId],
    });
  }

  /**
   * Takes someone out of the organization AND all its teams, in one batch:
   * - tasks assigned to them in those teams become unassigned,
   * - teams they owned get a new owner, `heirId` (an admin), so no team is left without one,
   * - then their team and organization memberships are deleted.
   * Their personal team and teams outside the organization aren't touched.
   */
  async removeMember(organizationId: number, userId: number, heirId: number): Promise<void> {
    await this.db.batch(
      [
        {
          sql: `UPDATE tasks SET assignee_id = NULL
                WHERE assignee_id = ? AND team_id IN ${ORGANIZATION_TEAM_IDS}`,
          args: [userId, organizationId],
        },
        // The heir becomes owner of each team the leaver owned (or, if the heir is already
        // in that team, is promoted to owner: that's the ON CONFLICT part).
        {
          sql: `INSERT INTO team_members (team_id, user_id, role)
                SELECT team_id, ?, 'owner' FROM team_members
                WHERE user_id = ? AND role = 'owner' AND team_id IN ${ORGANIZATION_TEAM_IDS}
                ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'owner'`,
          args: [heirId, userId, organizationId],
        },
        {
          sql: `DELETE FROM team_members WHERE user_id = ? AND team_id IN ${ORGANIZATION_TEAM_IDS}`,
          args: [userId, organizationId],
        },
        {
          sql: "DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?",
          args: [organizationId, userId],
        },
      ],
      "write",
    );
  }

  /** Adds someone to the organization as a member (if they aren't in it already). */
  async addMember(organizationId: number, userId: number): Promise<void> {
    await this.db.execute({
      sql: "INSERT OR IGNORE INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'member')",
      args: [organizationId, userId],
    });
  }

  /** Invites that haven't been used and haven't run out, newest first. */
  async invites(organizationId: number): Promise<OrganizationInvite[]> {
    const { rows } = await this.db.execute({
      sql: `${INVITE_SELECT}
            WHERE organization_invites.organization_id = ? AND organization_invites.expires_at > ${NOW}
            ORDER BY organization_invites.created_at DESC, organization_invites.id DESC`,
      args: [organizationId],
    });
    return (rows as unknown as InviteRow[]).map(toInvite);
  }

  /** Invites an email address. Inviting it again replaces the old invite (its link stops working). */
  async createInvite(organizationId: number, email: string, invitedBy: number): Promise<OrganizationInvite> {
    const address = normalizeEmail(email);
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const token = newToken();
    await this.db.batch(
      [
        { sql: "DELETE FROM organization_invites WHERE organization_id = ? AND email = ?", args: [organizationId, address] },
        {
          sql: `INSERT INTO organization_invites (organization_id, email, token, invited_by, expires_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: [organizationId, address, token, invitedBy, expiresAt],
        },
      ],
      "write",
    );
    return (await this.inviteByToken(token))!.invite;
  }

  /** The invite behind a link, or undefined if it doesn't exist or has run out. */
  async inviteByToken(token: string): Promise<{ invite: OrganizationInvite; preview: InvitePreview } | undefined> {
    const { rows } = await this.db.execute({
      sql: `${INVITE_SELECT} WHERE organization_invites.token = ? AND organization_invites.expires_at > ${NOW}`,
      args: [token],
    });
    const row = rows[0] as unknown as InviteRow | undefined;
    if (!row) return undefined;
    return {
      invite: toInvite(row),
      preview: {
        kind: "organization",
        name: row.organization_name,
        email: row.email,
        invitedBy: row.invited_by_name,
        expiresAt: row.expires_at,
      },
    };
  }

  /** Cancels an invite. Returns false if the organization has no such invite. */
  async deleteInvite(organizationId: number, inviteId: number): Promise<boolean> {
    const { rowsAffected } = await this.db.execute({
      sql: "DELETE FROM organization_invites WHERE id = ? AND organization_id = ?",
      args: [inviteId, organizationId],
    });
    return rowsAffected > 0;
  }

  /** Adds the user to the invite's organization as a member, and uses up the invite. */
  async acceptInvite(invite: OrganizationInvite, userId: number): Promise<OrganizationSummary> {
    await this.db.batch(
      [
        {
          sql: "INSERT OR IGNORE INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'member')",
          args: [invite.organizationId, userId],
        },
        { sql: "DELETE FROM organization_invites WHERE id = ?", args: [invite.id] },
      ],
      "write",
    );
    return (await this.membership(invite.organizationId, userId))!;
  }
}
