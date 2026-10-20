import { Router } from "express";
import { inputOf, validate } from "../../shared/validate.js";
import { factorySessionPlanParamsSchema } from "./factory.schema.js";
import type { FactoryService } from "./factory.service.js";

const sessionPlanSchemas = { params: factorySessionPlanParamsSchema };

export function factoryRoutes({ factory }: { factory: FactoryService }): Router {
  const router = Router();

  router.get("/v1/factory", async (_req, res) => {
    res.json(await factory.getFactoryState());
  });

  router.get("/v1/factory/plugins", async (_req, res) => {
    res.json(await factory.getPluginVersions());
  });

  router.get("/v1/factory/sessions/:sessionId/plan", validate(sessionPlanSchemas), async (_req, res) => {
    const { params } = inputOf<typeof sessionPlanSchemas>(res);
    res.json(await factory.getSessionPlan(params.sessionId));
  });

  return router;
}
