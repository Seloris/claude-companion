import { Router } from "express";
import { inputOf, validate } from "../../shared/validate.js";
import type { RefreshScheduler } from "./ingestion.scheduler.js";
import { refreshScheduleSchema, refreshStartQuerySchema } from "./ingestion.schema.js";
import type { IngestionService } from "./ingestion.service.js";

const startSchemas = { query: refreshStartQuerySchema };
const scheduleSchemas = { body: refreshScheduleSchema };

export function ingestionRoutes({
  ingestion,
  refreshScheduler,
}: {
  ingestion: IngestionService;
  refreshScheduler: Pick<RefreshScheduler, "getSchedule" | "setSchedule">;
}): Router {
  const router = Router();

  router.get("/v1/refresh", async (_req, res) => {
    res.json(await ingestion.getStatus());
  });

  router.post("/v1/refresh", validate(startSchemas), async (_req, res) => {
    const { query } = inputOf<typeof startSchemas>(res);
    res.status(202).json(await ingestion.start({ mode: query.mode }));
  });

  router.get("/v1/refresh/schedule", async (_req, res) => {
    res.json(await refreshScheduler.getSchedule());
  });

  router.put("/v1/refresh/schedule", validate(scheduleSchemas), async (_req, res) => {
    const { body } = inputOf<typeof scheduleSchemas>(res);
    res.json(await refreshScheduler.setSchedule(body));
  });

  return router;
}
