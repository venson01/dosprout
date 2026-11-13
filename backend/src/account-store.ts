import type { Client, InStatement } from "@libsql/client";
import { exampleDataStatements } from "./example-data.js";
import { hashToken, newToken } from "./passwords.js";
import { NOW } from "./task-store.js";
import type { User } from "./types.js";

/** How long a login lasts before you have to log in again. */
export const SESSION_DAYS = 30;

// A row exactly as SQLite returns it (snake_case columns).
interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  avatar_updated_at: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    avatarUpdatedAt: row.avatar_updated_at,
  };
}

/** A profile picture: its type ("image/jpeg"...) and the image bytes. */
export interface Avatar {
  contentType: string;
  data: Buffer;
}

/**
 * What an email address must look like: something@something.something, spaces around it
 * allowed (normalizeEmail removes them). A JSON-schema rule for the routes.
 */
export const EMAIL_SCHEMA = {
  type: "string",
  maxLength: 254,
  // "\\s" in this string is the regular expression \s (any space).
  pattern: "^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$",
} as const;

/** Emails are compared without caring about capitals or spaces: " Ada@Example.com" = "ada@example.com". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * All database reads and writes for accounts: users and their login sessions.
 * (Teams are in TeamStore.)
 */
export class AccountStore {
  constructor(private readonly db: Client) {}

  async getUser(id: number): Promise<User | undefined> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
    const row = rows[0] as unknown as UserRow | undefined;
    return row && toUser(row);
  }

  /** The user with this email, together with their password hash (for logging in). */
  async findByEmail(email: string): Promise<{ user: User; passwordHash: string } | undefined> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [normalizeEmail(email)],
    });
    const row = rows[0] as unknown as UserRow | undefined;
    return row && { user: toUser(row), passwordHash: row.password_hash };
  }

  /**
   * Creates a user together with their personal team, in one batch.
   * Then the new account is filled:
   * - The very first account takes over the data from before accounts existed
   *   (tasks, goals and time without a team, and the old shared settings).
   * - Otherwise, if `seed` is true, it gets example tasks.
   * Returns the new user and the id of their personal team.
   */
  async createUser(
    input: { name: string; email: string; passwordHash: string },
    { seed = false } = {},
  ): Promise<{ user: User; personalTeamId: number }> {
    const email = normalizeEmail(input.email);
    const results = await this.db.batch(
      [
        {
          sql: "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
          args: [email, input.name.trim(), input.passwordHash],
        },
        "INSERT INTO teams (name, personal) VALUES ('Personal', 1)",
        // last_insert_rowid() is the id of the team inserted just above.
        {
          sql: `INSERT INTO team_members (team_id, user_id, role)
                VALUES (last_insert_rowid(), (SELECT id FROM users WHERE email = ?), 'owner')`,
          args: [email],
        },
      ],
      "write",
    );
    const userId = Number(results[0].lastInsertRowid);
    const personalTeamId = Number(results[1].lastInsertRowid);

    // Data from before accounts existed has no team. Whoever signs up first gets it.
    const { rows } = await this.db.execute(
      "SELECT (SELECT COUNT(*) FROM tasks WHERE team_id IS NULL) + (SELECT COUNT(*) FROM goals WHERE team_id IS NULL) AS count",
    );
    const hasOldData = Number(rows[0].count) > 0;
    const statements: InStatement[] = [
      { sql: "UPDATE tasks SET team_id = ? WHERE team_id IS NULL", args: [personalTeamId] },
      { sql: "UPDATE goals SET team_id = ? WHERE team_id IS NULL", args: [personalTeamId] },
      {
        sql: "UPDATE time_entries SET team_id = ?, user_id = ? WHERE team_id IS NULL",
        args: [personalTeamId, userId],
      },
      // The old shared settings (one row, id 1) become this person's, and only theirs.
      { sql: "INSERT INTO user_settings (user_id, data) SELECT ?, data FROM settings WHERE id = 1", args: [userId] },
      "DELETE FROM settings",
    ];
    if (!hasOldData && seed) statements.push(...exampleDataStatements(personalTeamId, userId));
    await this.db.batch(statements, "write");

    return { user: (await this.getUser(userId))!, personalTeamId };
  }

  /** Logs a user in: returns a new random session token (for the cookie). Only its hash is stored. */
  async createSession(userId: number): Promise<string> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await this.db.batch(
      [
        // Tidy up: forget logins that have run out.
        `DELETE FROM sessions WHERE expires_at < ${NOW}`,
        {
          sql: "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
          args: [hashToken(token), userId, expiresAt],
        },
      ],
      "write",
    );
    return token;
  }

  /** The user a session token belongs to, or undefined if it's unknown or has run out. */
  async userForSession(token: string): Promise<User | undefined> {
    const { rows } = await this.db.execute({
      sql: `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ${NOW}`,
      args: [hashToken(token)],
    });
    const row = rows[0] as unknown as UserRow | undefined;
    return row && toUser(row);
  }

  /** Logs out: the token stops working. */
  async deleteSession(token: string): Promise<void> {
    await this.db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
  }

  /** Sets (or replaces) someone's profile picture. Returns the updated user. */
  async setAvatar(userId: number, avatar: Avatar): Promise<User> {
    // Stored as base64 text: it travels through every kind of database (and copy-tasks) unchanged.
    await this.db.batch(
      [
        {
          sql: `INSERT INTO avatars (user_id, content_type, data) VALUES (?, ?, ?)
                ON CONFLICT (user_id) DO UPDATE SET content_type = excluded.content_type, data = excluded.data`,
          args: [userId, avatar.contentType, avatar.data.toString("base64")],
        },
        // A new time = a new picture address (?v=...), so browsers don't show the old one.
        { sql: `UPDATE users SET avatar_updated_at = ${NOW} WHERE id = ?`, args: [userId] },
      ],
      "write",
    );
    return (await this.getUser(userId))!;
  }

  /** Removes someone's profile picture (their initials show again). Returns the updated user. */
  async removeAvatar(userId: number): Promise<User> {
    await this.db.batch(
      [
        { sql: "DELETE FROM avatars WHERE user_id = ?", args: [userId] },
        { sql: "UPDATE users SET avatar_updated_at = NULL WHERE id = ?", args: [userId] },
      ],
      "write",
    );
    return (await this.getUser(userId))!;
  }

  /**
   * Someone's profile picture, if `viewerId` may see it: their own, or someone they share
   * a team or an organization with. Otherwise (or when there's none) undefined.
   */
  async avatarFor(userId: number, viewerId: number): Promise<Avatar | undefined> {
    const { rows } = await this.db.execute({
      sql: `SELECT content_type, data FROM avatars
            WHERE user_id = ?
              AND (user_id = ?
                OR EXISTS (SELECT 1 FROM team_members theirs
                           JOIN team_members mine ON mine.team_id = theirs.team_id
                           WHERE theirs.user_id = avatars.user_id AND mine.user_id = ?)
                OR EXISTS (SELECT 1 FROM organization_members theirs
                           JOIN organization_members mine ON mine.organization_id = theirs.organization_id
                           WHERE theirs.user_id = avatars.user_id AND mine.user_id = ?))`,
      args: [userId, viewerId, viewerId, viewerId],
    });
    const row = rows[0];
    if (!row) return undefined;
    return { contentType: String(row.content_type), data: Buffer.from(String(row.data), "base64") };
  }
}
