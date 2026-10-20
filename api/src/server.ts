import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { createApp } from "./app.js";
import { readCliOptions, readConfig } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/client.js";
import { createDashboardRepository } from "./features/dashboard/dashboard.repository.js";
import { createDashboardService } from "./features/dashboard/dashboard.service.js";
import { createIngestionRepository } from "./features/ingestion/ingestion.repository.js";
import { createRefreshScheduler } from "./features/ingestion/ingestion.scheduler.js";
import { createIngestionService } from "./features/ingestion/ingestion.service.js";
import { findRepoRoot } from "./features/ingestion/ingestion.workspace.js";
import { createLiveService } from "./features/live/live.service.js";
import { isPidAlive } from "./features/live/live.source.js";
import { createRetentionService } from "./features/retention/retention.service.js";
import { createWorkspacesRepository } from "./features/workspaces/workspaces.repository.js";
import { createWorkspacesService } from "./features/workspaces/workspaces.service.js";
import { systemClock } from "./shared/clock.js";
import { systemTimer } from "./shared/timer.js";

const config = readConfig();
const { webDir } = readCliOptions();

// An explicit flag must not silently serve the API alone.
if (webDir !== null && !existsSync(path.join(webDir, "index.html"))) {
  console.error(`No built front in ${webDir}: run "npm run build" at the repository root.`);
  process.exit(1);
}

// The port is bound before PGlite is opened: it is the single-instance lock of the PGlite folder, which allows one
// process only. A second instance exits here, before touching the database. Loopback only: the recap holds the
// whole prompt history, never served to the network.
// Until the database is migrated and the app attached, a request gets a 503 instead of hanging on the open socket.
const starting: http.RequestListener = (_req, res) => {
  res.writeHead(503, { "Retry-After": "1" }).end();
};
const server = http.createServer(starting);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(config.PORT, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
}).catch((error: unknown) => {
  if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.PORT} is in use, probably by another instance of the API (npm start or npm run dev) which holds the database.`,
    );
    process.exit(1);
  }
  throw error;
});

const db = openDatabase(config.PGLITE_DIR);
await migrateDatabase(db);

// The history and the live page attach a session to its workspace by the same rules, scratch folders included.
const scratchRoot = config.APPDATA === "" ? "" : path.join(config.APPDATA, "Claude", "scratch-workspaces");
const workspacesRepo = createWorkspacesRepository(db);
const ingestionRepo = createIngestionRepository(db);
const ingestion = createIngestionService({
  ingestionRepo,
  workspacesRepo,
  clock: systemClock,
  logsDir: config.CLAUDE_PROJECTS_DIR,
  scratchRoot,
});
const refreshScheduler = createRefreshScheduler({ ingestion, ingestionRepo, clock: systemClock, timer: systemTimer });
const retention = createRetentionService({
  ingestionRepo,
  workspacesRepo,
  clock: systemClock,
  logsDir: config.CLAUDE_PROJECTS_DIR,
  settingsFile: config.CLAUDE_SETTINGS_FILE,
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

server.off("request", starting);
server.on(
  "request",
  createApp({ db, clock: systemClock, ingestion, workspaces, dashboard, live, refreshScheduler, retention, ...(webDir === null ? {} : { webDir }) }),
);
console.log(`api listening on http://127.0.0.1:${config.PORT}`);
if (webDir !== null) console.log(`app on http://localhost:${config.PORT}`);
// FR-01: the start-up refresh runs in the background; the stored recap is served meanwhile.
ingestion.start().catch((error: unknown) => console.error("start-up refresh failed", error));
// FR-13: the first periodic tick comes one interval after start-up.
refreshScheduler.start().catch((error: unknown) => console.error("periodic refresh could not be scheduled", error));
