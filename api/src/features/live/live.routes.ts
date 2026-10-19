import { Router } from "express";
import type { LiveService } from "./live.service.js";

export function liveRoutes({ live }: { live: LiveService }): Router {
  const router = Router();

  router.get("/v1/live", async (_req, res) => {
    res.json(await live.getLiveState());
  });

  return router;
}
