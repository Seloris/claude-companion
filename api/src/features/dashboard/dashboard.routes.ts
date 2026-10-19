import { Router } from "express";
import { inputOf, validate } from "../../shared/validate.js";
import { dashboardQuerySchema } from "./dashboard.schema.js";
import type { DashboardService } from "./dashboard.service.js";

const dashboardSchemas = { query: dashboardQuerySchema };

export function dashboardRoutes({ dashboard }: { dashboard: DashboardService }): Router {
  const router = Router();

  // An unknown workspace is a filter that matches nothing: an empty dashboard, not a 404.
  router.get("/v1/dashboard", validate(dashboardSchemas), async (_req, res) => {
    const { query } = inputOf<typeof dashboardSchemas>(res);
    res.json(await dashboard.getDashboard(query));
  });

  return router;
}
