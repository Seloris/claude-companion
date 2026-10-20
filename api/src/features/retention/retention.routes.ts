import { Router } from "express";
import type { RetentionService } from "./retention.service.js";

export function retentionRoutes({ retention }: { retention: RetentionService }): Router {
  const router = Router();

  router.get("/v1/retention", async (_req, res) => {
    res.json(await retention.getRetention());
  });

  return router;
}
