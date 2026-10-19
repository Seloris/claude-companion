import { sql } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { migrateDatabase, openDatabase, type Database } from "../src/db/client.js";
import type { Clock } from "../src/shared/clock.js";

const EPOCH = "2026-01-01T00:00:00.000Z";

export interface TestClock extends Clock {
  set(iso: string): void;
}

export function createTestClock(): TestClock {
  let current = new Date(EPOCH);
  return {
    now: () => current,
    set: (iso) => {
      current = new Date(iso);
    },
  };
}

export async function createTestContext() {
  const db: Database = openDatabase();
  await migrateDatabase(db);
  const clock = createTestClock();
  const app = createApp({ db, clock });
  const seed = {};
  const reset = async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name <> '__drizzle_migrations'
    `);
    for (const { table_name } of tables.rows) {
      await db.execute(sql.raw(`truncate table "${table_name}" cascade`));
    }
    clock.set(EPOCH);
  };
  return { app, db, clock, seed, reset };
}
