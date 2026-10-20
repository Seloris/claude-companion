import { sql } from "drizzle-orm";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { migrateDatabase, openDatabase, type Database } from "../src/db/client.js";
import { createDashboardRepository } from "../src/features/dashboard/dashboard.repository.js";
import { createDashboardService } from "../src/features/dashboard/dashboard.service.js";
import type { ParsedSession } from "../src/features/ingestion/ingestion.parser.js";
import { createRefreshScheduler } from "../src/features/ingestion/ingestion.scheduler.js";
import { createIngestionRepository } from "../src/features/ingestion/ingestion.repository.js";
import { createIngestionService } from "../src/features/ingestion/ingestion.service.js";
import type { ResolvedWorkspace } from "../src/features/ingestion/ingestion.workspace.js";
import { createLiveService } from "../src/features/live/live.service.js";
import { createRetentionService } from "../src/features/retention/retention.service.js";
import { createWorkspacesRepository } from "../src/features/workspaces/workspaces.repository.js";
import { createWorkspacesService } from "../src/features/workspaces/workspaces.service.js";
import type { Clock } from "../src/shared/clock.js";
import type { Timer } from "../src/shared/timer.js";

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

export interface TestTimer extends Timer {
  // The delays of the tasks still pending, in the order they were scheduled.
  pending(): number[];
  // Runs every pending task, each removed first (a task re-arming itself is not run again).
  fire(): void;
  clear(): void;
}

// Time never passes by itself: a test fires the pending tasks.
export function createTestTimer(): TestTimer {
  let tasks: { delayMs: number; run: () => void }[] = [];
  return {
    schedule(run, delayMs) {
      const task = { delayMs, run };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((candidate) => candidate !== task);
      };
    },
    pending: () => tasks.map((task) => task.delayMs),
    fire() {
      const due = tasks;
      tasks = [];
      for (const task of due) task.run();
    },
    clear() {
      tasks = [];
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
  // Claude Code's settings file lives in the temp root, absent until a test writes it: never the real ~/.claude/settings.json.
  const settingsFile = path.join(tempRoot, "settings.json");
  const retention = createRetentionService({ ingestionRepo, workspacesRepo, clock, logsDir, settingsFile });
  const timer = createTestTimer();
  const dashboard = createDashboardService({ dashboardRepo: createDashboardRepository(db), clock });
  // Status files go to a temp folder, never the real ~/.claude/sessions; a pid is alive when the test says so.
  const sessionsDir = path.join(tempRoot, "sessions");
  await mkdir(sessionsDir);
  const alivePids = new Set<number>();
  const buildLive = () =>
    createLiveService({
      workspacesRepo,
      ingestion,
      clock,
      sessionsDir,
      logsDir,
      scratchRoot,
      isPidAlive: (pid) => alivePids.has(pid),
      findRepoRoot: () => null,
    });
  // The service keeps snapshots and caches in memory: reset() swaps it for a fresh one so no test sees another's.
  let current = buildLive();
  const live = { getLiveState: () => current.getLiveState() };
  // Never started by the context: a test calls start() itself. reset() swaps it for a fresh one (truncation wipes the
  // row, not the memory).
  const buildScheduler = () => createRefreshScheduler({ ingestion, ingestionRepo, clock, timer });
  let currentScheduler = buildScheduler();
  const refreshScheduler = {
    getSchedule: () => currentScheduler.getSchedule(),
    setSchedule: (schedule: Parameters<typeof currentScheduler.setSchedule>[0]) => currentScheduler.setSchedule(schedule),
  };
  const app = createApp({ db, clock, ingestion, workspaces, dashboard, live, refreshScheduler, retention });

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
    await mkdir(sessionsDir, { recursive: true });
    alivePids.clear();
    current = buildLive();
    currentScheduler.stop();
    timer.clear();
    currentScheduler = buildScheduler();
    clock.set(EPOCH);
  };

  const dispose = async () => {
    currentScheduler.stop();
    await ingestion.whenIdle();
    await rm(tempRoot, { recursive: true, force: true });
  };

  return {
    app,
    db,
    clock,
    seed,
    reset,
    dispose,
    ingestion,
    ingestionRepo,
    workspaces,
    retention,
    logsDir,
    scratchRoot,
    tempRoot,
    sessionsDir,
    settingsFile,
    alivePids,
    timer,
    refreshScheduler,
    // A scheduler as a restarted application would build it, over the same database.
    buildScheduler,
    scheduler: () => currentScheduler,
  };
}
