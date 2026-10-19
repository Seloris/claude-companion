import { sql } from "drizzle-orm";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { migrateDatabase, openDatabase, type Database } from "../src/db/client.js";
import type { ParsedSession } from "../src/features/ingestion/ingestion.parser.js";
import { createIngestionRepository } from "../src/features/ingestion/ingestion.repository.js";
import { createIngestionService } from "../src/features/ingestion/ingestion.service.js";
import type { ResolvedWorkspace } from "../src/features/ingestion/ingestion.workspace.js";
import { createWorkspacesRepository } from "../src/features/workspaces/workspaces.repository.js";
import { createWorkspacesService } from "../src/features/workspaces/workspaces.service.js";
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

// The logs dir is a fresh temp folder by default: no test ever reads the real ~/.claude/projects.
export async function createTestContext(options: { logsDir?: string } = {}) {
  const db: Database = openDatabase();
  await migrateDatabase(db);
  const clock = createTestClock();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "claude-companion-"));
  const logsDir = options.logsDir ?? path.join(tempRoot, "projects");
  const scratchRoot = path.join(tempRoot, "scratch-workspaces");
  const ingestionRepo = createIngestionRepository(db);
  const workspacesRepo = createWorkspacesRepository(db);
  const ingestion = createIngestionService({ ingestionRepo, workspacesRepo, clock, logsDir, scratchRoot });
  const workspaces = createWorkspacesService({ workspacesRepo });
  const app = createApp({ db, clock, ingestion, workspaces });

  const seed = {
    async session(workspace: ResolvedWorkspace, session: ParsedSession, options: { isArchived?: boolean } = {}) {
      await workspacesRepo.saveSession(workspace, session);
      if (options.isArchived === true) await workspacesRepo.archiveSessions([session.sessionId]);
    },
  };

  const reset = async () => {
    // A run still in progress would write into the next test's tables.
    await ingestion.whenIdle();
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name <> '__drizzle_migrations'
    `);
    for (const { table_name } of tables.rows) {
      await db.execute(sql.raw(`truncate table "${table_name}" restart identity cascade`));
    }
    for (const entry of await readdir(tempRoot)) {
      await rm(path.join(tempRoot, entry), { recursive: true, force: true });
    }
    clock.set(EPOCH);
  };

  return { app, db, clock, seed, reset, ingestion, workspaces, logsDir, scratchRoot, tempRoot };
}
