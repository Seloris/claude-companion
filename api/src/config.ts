import os from "node:os";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  PGLITE_DIR: z.string().default(".data/pglite"),
  CLAUDE_PROJECTS_DIR: z.string().default(path.join(os.homedir(), ".claude", "projects")),
  // The desktop app's scratch workspaces live under it; unset outside Windows.
  APPDATA: z.string().default(""),
});

export type Config = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
