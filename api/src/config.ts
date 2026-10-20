import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  PGLITE_DIR: z.string().default(".data/pglite"),
  CLAUDE_PROJECTS_DIR: z.string().default(path.join(os.homedir(), ".claude", "projects")),
  // Claude Code's live state: one {pid}.json per running process. The {pid}.{hash}.key files beside them hold credentials.
  CLAUDE_SESSIONS_DIR: z.string().default(path.join(os.homedir(), ".claude", "sessions")),
  // Claude Code's user settings, read only for cleanupPeriodDays (the log retention).
  CLAUDE_SETTINGS_FILE: z.string().default(path.join(os.homedir(), ".claude", "settings.json")),
  // The factory-board mod's export, one JSON per project root, read only.
  CLAUDE_FACTORY_BOARD_DIR: z.string().default(path.join(os.homedir(), ".claude", "factory-board")),
  // Claude Code's installed plugins, read only for the factory and factory-board versions.
  CLAUDE_PLUGINS_FILE: z.string().default(path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json")),
  // The desktop app's scratch workspaces live under it; unset outside Windows.
  APPDATA: z.string().default(""),
});

export type Config = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}

// A command-line flag, not an environment variable: an npm script cannot set one portably (cmd.exe), and a default
// folder would make the dev API serve a stale build.
export function readCliOptions(argv: string[] = process.argv.slice(2)): { webDir: string | null } {
  const { values } = parseArgs({ args: argv, options: { "web-dir": { type: "string" } }, strict: true });
  const webDir = values["web-dir"];
  return { webDir: webDir === undefined ? null : path.resolve(webDir) };
}
