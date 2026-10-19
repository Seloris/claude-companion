import { Router } from "express";
import { inputOf, validate } from "../../shared/validate.js";
import { refreshStartQuerySchema } from "./ingestion.schema.js";
import type { IngestionService } from "./ingestion.service.js";

const startSchemas = { query: refreshStartQuerySchema };

export function ingestionRoutes({ ingestion }: { ingestion: IngestionService }): Router {
  const router = Router();

  router.get("/v1/refresh", async (_req, res) => {
    res.json(await ingestion.getStatus());
  });

  router.post("/v1/refresh", validate(startSchemas), async (_req, res) => {
    const { query } = inputOf<typeof startSchemas>(res);
    res.status(202).json(await ingestion.start({ mode: query.mode }));
  });

  return router;
}
