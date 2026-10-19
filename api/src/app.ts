import express from "express";
import type { Database } from "./db/client.js";
import { dashboardRoutes } from "./features/dashboard/dashboard.routes.js";
import type { DashboardService } from "./features/dashboard/dashboard.service.js";
import { healthRoutes } from "./features/health/health.routes.js";
import { ingestionRoutes } from "./features/ingestion/ingestion.routes.js";
import type { IngestionService } from "./features/ingestion/ingestion.service.js";
import { workspacesRoutes } from "./features/workspaces/workspaces.routes.js";
import type { WorkspacesService } from "./features/workspaces/workspaces.service.js";
import type { Clock } from "./shared/clock.js";
import { errorHandler } from "./shared/errors.js";

export interface AppContext {
  db: Database;
  clock: Clock;
  ingestion: IngestionService;
  workspaces: WorkspacesService;
  dashboard: DashboardService;
}

// Every route is public: the application is local and single-user, with no sign-in.
export function createApp({ clock, ingestion, workspaces, dashboard }: AppContext) {
  const app = express();
  app.use(express.json());
  app.use(healthRoutes({ clock }));
  app.use(ingestionRoutes({ ingestion }));
  app.use(workspacesRoutes({ workspaces }));
  app.use(dashboardRoutes({ dashboard }));
  app.use(errorHandler);
  return app;
}
