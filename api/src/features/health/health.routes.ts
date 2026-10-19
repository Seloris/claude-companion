import { Router } from "express";
import type { Clock } from "../../shared/clock.js";
import type { HealthResponse } from "./health.schema.js";

// Public: no sign-in on this route.
export function healthRoutes({ clock }: { clock: Clock }): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", time: clock.now().toISOString() };
    res.json(body);
  });
  return router;
}
