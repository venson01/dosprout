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

/** Saves the whole settings object (there's only one row, id 1). */
export function saveSettingsStatement(settings: Settings): InStatement {
  return {
    sql: `INSERT INTO settings (id, data) VALUES (1, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [JSON.stringify(settings)],
  };
}

/**
 * The app's settings (theme, timer lengths, task defaults...). They're stored as one
 * JSON object in a one-row table, so adding a setting later needs no database change:
 * withDefaults() fills it in.
 */
export class SettingsStore {
  constructor(private readonly db: Client) {}

  async get(): Promise<Settings> {
    const { rows } = await this.db.execute("SELECT data FROM settings WHERE id = 1");
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
    await this.db.execute(saveSettingsStatement(next));
    return next;
  }
}
