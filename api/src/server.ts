import path from "node:path";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/client.js";
import { createIngestionRepository } from "./features/ingestion/ingestion.repository.js";
import { createIngestionService } from "./features/ingestion/ingestion.service.js";
import { createWorkspacesRepository } from "./features/workspaces/workspaces.repository.js";
import { createWorkspacesService } from "./features/workspaces/workspaces.service.js";
import { systemClock } from "./shared/clock.js";

const config = readConfig();
const db = openDatabase(config.PGLITE_DIR);
await migrateDatabase(db);

const workspacesRepo = createWorkspacesRepository(db);
const ingestion = createIngestionService({
  ingestionRepo: createIngestionRepository(db),
  workspacesRepo,
  clock: systemClock,
  logsDir: config.CLAUDE_PROJECTS_DIR,
  scratchRoot: config.APPDATA === "" ? "" : path.join(config.APPDATA, "Claude", "scratch-workspaces"),
});
const workspaces = createWorkspacesService({ workspacesRepo });

createApp({ db, clock: systemClock, ingestion, workspaces }).listen(config.PORT, () => {
  console.log(`api listening on http://localhost:${config.PORT}`);
  // FR-01: the start-up refresh runs in the background; the stored recap is served meanwhile.
  ingestion.start().catch((error: unknown) => console.error("start-up refresh failed", error));
});
