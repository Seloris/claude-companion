import { Router } from "express";
import type { FactoryService } from "./factory.service.js";

export function factoryRoutes({ factory }: { factory: FactoryService }): Router {
  const router = Router();

  router.get("/v1/factory", async (_req, res) => {
    res.json(await factory.getFactoryState());
  });

  return router;
}
