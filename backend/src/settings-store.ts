import type { Client, InStatement } from "@libsql/client";
import { DEFAULT_SETTINGS, type Settings, type UpdateSettingsInput } from "./types.js";

/** Fills in anything missing (e.g. a setting added in a newer version) from the defaults. */
export function withDefaults(saved: Partial<Settings> | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...saved?.notifications },
  };
}

/** Saves the whole settings object for one person (one row per user). */
export function saveSettingsStatement(userId: number, settings: Settings): InStatement {
  return {
    sql: `INSERT INTO user_settings (user_id, data) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`,
    args: [userId, JSON.stringify(settings)],
  };
}

/**
 * One person's settings (theme, timer lengths, task defaults...). They're stored as one
 * JSON object per user, so adding a setting later needs no database change:
 * withDefaults() fills it in.
 */
export class SettingsStore {
  constructor(
    private readonly db: Client,
    private readonly userId: number,
  ) {}

  async get(): Promise<Settings> {
    const { rows } = await this.db.execute({
      sql: "SELECT data FROM user_settings WHERE user_id = ?",
      args: [this.userId],
    });
    const row = rows[0] as unknown as { data: string } | undefined;
    return withDefaults(row ? (JSON.parse(row.data) as Partial<Settings>) : null);
  }

  /** Changes only the settings given; returns all of them. */
  async update(input: UpdateSettingsInput): Promise<Settings> {
    const current = await this.get();
    const next: Settings = {
      ...current,
      ...input,
      notifications: { ...current.notifications, ...input.notifications },
    };
    await this.db.execute(saveSettingsStatement(this.userId, next));
    return next;
  }
}
