import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";

// Deployment swaps this for drizzle-orm/node-postgres on DATABASE_URL: same schema, same migrations.
export function openDatabase(dataDir?: string) {
  const client = dataDir === undefined ? new PGlite() : new PGlite(dataDir);
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof openDatabase>;

export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: "drizzle" });
}
