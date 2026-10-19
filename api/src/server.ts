import path from "node:path";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/client.js";
import { createDashboardRepository } from "./features/dashboard/dashboard.repository.js";
import { createDashboardService } from "./features/dashboard/dashboard.service.js";
import { createIngestionRepository } from "./features/ingestion/ingestion.repository.js";
import { createIngestionService } from "./features/ingestion/ingestion.service.js";
import { findRepoRoot } from "./features/ingestion/ingestion.workspace.js";
import { createLiveService } from "./features/live/live.service.js";
import { isPidAlive } from "./features/live/live.source.js";
import { createWorkspacesRepository } from "./features/workspaces/workspaces.repository.js";
import { createWorkspacesService } from "./features/workspaces/workspaces.service.js";
import { systemClock } from "./shared/clock.js";

const config = readConfig();
const db = openDatabase(config.PGLITE_DIR);
await migrateDatabase(db);

// The history and the live page attach a session to its workspace by the same rules, scratch folders included.
const scratchRoot = config.APPDATA === "" ? "" : path.join(config.APPDATA, "Claude", "scratch-workspaces");
const workspacesRepo = createWorkspacesRepository(db);
const ingestion = createIngestionService({
  ingestionRepo: createIngestionRepository(db),
  workspacesRepo,
  clock: systemClock,
  logsDir: config.CLAUDE_PROJECTS_DIR,
  scratchRoot,
});
const workspaces = createWorkspacesService({ workspacesRepo });
const dashboard = createDashboardService({ dashboardRepo: createDashboardRepository(db), clock: systemClock });
const live = createLiveService({
  workspacesRepo,
  ingestion,
  clock: systemClock,
  sessionsDir: config.CLAUDE_SESSIONS_DIR,
  logsDir: config.CLAUDE_PROJECTS_DIR,
  scratchRoot,
  isPidAlive,
  findRepoRoot,
});

// Loopback only: the recap holds the whole prompt history, never served to the network.
createApp({ db, clock: systemClock, ingestion, workspaces, dashboard, live }).listen(config.PORT, "127.0.0.1", () => {
  console.log(`api listening on http://127.0.0.1:${config.PORT}`);
  // FR-01: the start-up refresh runs in the background; the stored recap is served meanwhile.
  ingestion.start().catch((error: unknown) => console.error("start-up refresh failed", error));
});
