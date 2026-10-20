import os from "node:os";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  PGLITE_DIR: z.string().default(".data/pglite"),
  CLAUDE_PROJECTS_DIR: z.string().default(path.join(os.homedir(), ".claude", "projects")),
  // Claude Code's live state: one {pid}.json per running process. The {pid}.{hash}.key files beside them hold credentials.
  CLAUDE_SESSIONS_DIR: z.string().default(path.join(os.homedir(), ".claude", "sessions")),
  // Claude Code's user settings, read only for cleanupPeriodDays (the log retention).
  CLAUDE_SETTINGS_FILE: z.string().default(path.join(os.homedir(), ".claude", "settings.json")),
  // The desktop app's scratch workspaces live under it; unset outside Windows.
  APPDATA: z.string().default(""),
});

export type Config = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
