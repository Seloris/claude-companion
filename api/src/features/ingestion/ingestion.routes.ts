import { Router } from "express";
import type { IngestionService } from "./ingestion.service.js";

export function ingestionRoutes({ ingestion }: { ingestion: IngestionService }): Router {
  const router = Router();

  router.get("/v1/refresh", async (_req, res) => {
    res.json(await ingestion.getStatus());
  });

  router.post("/v1/refresh", async (_req, res) => {
    res.status(202).json(await ingestion.start());
  });

  return router;
}
