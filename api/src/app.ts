import express from "express";
import type { Database } from "./db/client.js";
import { healthRoutes } from "./features/health/health.routes.js";
import type { Clock } from "./shared/clock.js";
import { errorHandler } from "./shared/errors.js";

export interface AppContext {
  db: Database;
  clock: Clock;
}

export function createApp({ clock }: AppContext) {
  const app = express();
  app.use(express.json());
  app.use(healthRoutes({ clock }));
  app.use(errorHandler);
  return app;
}
