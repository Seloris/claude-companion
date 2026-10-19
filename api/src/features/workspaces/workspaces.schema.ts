import { z } from "zod";
import { problemDetailsSchema } from "../../shared/errors.js";
import { registry } from "../../shared/openapi.js";

export const tokenCountsSchema = z
  .object({
    input: z.number().int(),
    output: z.number().int(),
    cacheRead: z.number().int(),
    cacheWrite: z.number().int(),
  })
  .meta({ id: "TokenCounts" });

export const workspaceSummarySchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    path: z.string(),
    isScratch: z.boolean(),
    sessionCount: z.number().int(),
    lastActivityAt: z.iso.datetime().nullable(),
    tokens: tokenCountsSchema,
  })
  .meta({ id: "WorkspaceSummary" });

export const workspaceListQuerySchema = z.object({
  includeScratch: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const workspaceListSchema = z
  .object({
    workspaces: z.array(workspaceSummarySchema),
    totals: z.object({ sessionCount: z.number().int(), tokens: tokenCountsSchema }),
  })
  .meta({ id: "WorkspaceList" });

export const sessionSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    durationMs: z.number().int(),
    models: z.array(z.string()),
    gitBranch: z.string().nullable(),
    origin: z.string().nullable(),
    promptCount: z.number().int(),
    subagentCount: z.number().int(),
    isArchived: z.boolean(),
    tokens: tokenCountsSchema,
  })
  .meta({ id: "SessionSummary" });

export const workspaceParamsSchema = z.object({ workspaceId: z.coerce.number().int().positive() });

export const workspaceDetailSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    path: z.string(),
    isScratch: z.boolean(),
    sessions: z.array(sessionSummarySchema),
  })
  .meta({ id: "WorkspaceDetail" });

export const sessionParamsSchema = z.object({ sessionId: z.string().min(1) });

export const sessionDetailSchema = sessionSummarySchema
  .extend({
    workspace: z.object({ id: z.number().int(), name: z.string() }),
    usages: z.array(z.object({ model: z.string(), tokens: tokenCountsSchema })),
    prompts: z.array(z.object({ position: z.number().int(), text: z.string(), sentAt: z.iso.datetime() })),
  })
  .meta({ id: "SessionDetail" });

export type TokenCounts = z.infer<typeof tokenCountsSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceList = z.infer<typeof workspaceListSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

const notFound = {
  description: "Not found",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
};
const invalid = {
  description: "Invalid request",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
};

registry.registerPath({
  method: "get",
  path: "/v1/workspaces",
  summary: "Workspaces, most recent activity first, with their totals",
  request: { query: workspaceListQuerySchema },
  responses: {
    200: { description: "The workspaces", content: { "application/json": { schema: workspaceListSchema } } },
    400: invalid,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}",
  summary: "A workspace and its sessions, most recent first",
  request: { params: workspaceParamsSchema },
  responses: {
    200: { description: "The workspace", content: { "application/json": { schema: workspaceDetailSchema } } },
    400: invalid,
    404: notFound,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/sessions/{sessionId}",
  summary: "A session with its token usage per model and its prompts",
  request: { params: sessionParamsSchema },
  responses: {
    200: { description: "The session", content: { "application/json": { schema: sessionDetailSchema } } },
    404: notFound,
  },
});
