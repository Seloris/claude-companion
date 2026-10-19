import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PGLITE_DIR: z.string().default(".data/pglite"),
});

export type Config = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
