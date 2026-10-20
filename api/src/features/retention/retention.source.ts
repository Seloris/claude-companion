import { readFile } from "node:fs/promises";
import { z } from "zod";

// Read only (session-ingestion BR-13): Claude Code's user settings are never written.

// Claude Code's own default.
export const DEFAULT_LOG_RETENTION_DAYS = 30;

// 0 keeps no transcript at all (nothing for this application to read); the upper bound keeps the estimated dates valid.
const settingsSchema = z.object({ cleanupPeriodDays: z.number().int().min(1).max(36_500) });

export interface LogRetention {
  retentionDays: number;
  // True when the setting is missing, unreadable or invalid: the page says the default applies.
  isDefault: boolean;
}

export async function readLogRetention(settingsFile: string): Promise<LogRetention> {
  const fallback = { retentionDays: DEFAULT_LOG_RETENTION_DAYS, isDefault: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(settingsFile, "utf8")) as unknown;
  } catch {
    return fallback;
  }
  const settings = settingsSchema.safeParse(parsed);
  return settings.success ? { retentionDays: settings.data.cleanupPeriodDays, isDefault: false } : fallback;
}
