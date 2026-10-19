import { Router } from "express";
import { inputOf, validate } from "../../shared/validate.js";
import { sessionParamsSchema, workspaceListQuerySchema, workspaceParamsSchema } from "./workspaces.schema.js";
import type { WorkspacesService } from "./workspaces.service.js";

const listSchemas = { query: workspaceListQuerySchema };
const workspaceSchemas = { params: workspaceParamsSchema };
const sessionSchemas = { params: sessionParamsSchema };

export function workspacesRoutes({ workspaces }: { workspaces: WorkspacesService }): Router {
  const router = Router();

  router.get("/v1/workspaces", validate(listSchemas), async (_req, res) => {
    const { query } = inputOf<typeof listSchemas>(res);
    res.json(await workspaces.listWorkspaces({ includeScratch: query.includeScratch }));
  });

  router.get("/v1/workspaces/:workspaceId", validate(workspaceSchemas), async (_req, res) => {
    const { params } = inputOf<typeof workspaceSchemas>(res);
    res.json(await workspaces.getWorkspace(params.workspaceId));
  });

  router.get("/v1/sessions/:sessionId", validate(sessionSchemas), async (_req, res) => {
    const { params } = inputOf<typeof sessionSchemas>(res);
    res.json(await workspaces.getSession(params.sessionId));
  });

  return router;
}
