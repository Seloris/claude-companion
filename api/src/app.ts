import express, { Router } from "express";
import type { Database } from "./db/client.js";
import { dashboardRoutes } from "./features/dashboard/dashboard.routes.js";
import type { DashboardService } from "./features/dashboard/dashboard.service.js";
import { healthRoutes } from "./features/health/health.routes.js";
import { ingestionRoutes } from "./features/ingestion/ingestion.routes.js";
import type { RefreshScheduler } from "./features/ingestion/ingestion.scheduler.js";
import type { IngestionService } from "./features/ingestion/ingestion.service.js";
import { liveRoutes } from "./features/live/live.routes.js";
import type { LiveService } from "./features/live/live.service.js";
import { retentionRoutes } from "./features/retention/retention.routes.js";
import type { RetentionService } from "./features/retention/retention.service.js";
import { workspacesRoutes } from "./features/workspaces/workspaces.routes.js";
import type { WorkspacesService } from "./features/workspaces/workspaces.service.js";
import type { Clock } from "./shared/clock.js";
import { errorHandler } from "./shared/errors.js";
import { webRoutes } from "./shared/web.js";

export interface AppContext {
  db: Database;
  clock: Clock;
  ingestion: IngestionService;
  workspaces: WorkspacesService;
  dashboard: DashboardService;
  live: LiveService;
  refreshScheduler: Pick<RefreshScheduler, "getSchedule" | "setSchedule">;
  retention: RetentionService;
  // Absolute folder of the built front; when set, the app also serves it (see shared/web.ts).
  webDir?: string;
}

// Every route is public: the application is local and single-user, with no sign-in.
export function createApp({ clock, ingestion, workspaces, dashboard, live, refreshScheduler, retention, webDir }: AppContext) {
  const app = express();
  app.use(express.json());
  const apiRouter = Router();
  apiRouter.use(healthRoutes({ clock }));
  apiRouter.use(ingestionRoutes({ ingestion, refreshScheduler }));
  apiRouter.use(workspacesRoutes({ workspaces }));
  apiRouter.use(dashboardRoutes({ dashboard }));
  apiRouter.use(liveRoutes({ live }));
  apiRouter.use(retentionRoutes({ retention }));
  // At the root always (OpenAPI paths, route tests, Vite's proxy which strips /api); under /api too when serving the
  // front, whose base URL it is. Both mounts come before the static files, so an API path always wins.
  app.use(apiRouter);
  if (webDir !== undefined) {
    app.use("/api", apiRouter);
    app.use(webRoutes({ webDir }));
  }
  app.use(errorHandler);
  return app;
}
