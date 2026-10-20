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
    toolCallCount: z.number().int(),
    failedToolCallCount: z.number().int(),
    skillCallCount: z.number().int(),
    agentTypes: z.array(z.string()),
    // The link that opens the session in the Claude desktop app, null without one (FR-16, BR-19).
    desktopLink: z.string().nullable(),
    // Two lines, null when archived, linked, not re-read yet or with an unsafe folder; the front hides it while the
    // session is live (FR-17, BR-15).
    resumeCommand: z.string().nullable(),
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

// FR-06: what happened in the session, in time order; a typed skill call shows once, as the skill call.
export const activityEntrySchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("prompt"), at: z.iso.datetime(), position: z.number().int(), text: z.string() }),
    z.object({
      kind: z.literal("skill"),
      at: z.iso.datetime(),
      name: z.string(),
      args: z.string().nullable(),
      isTyped: z.boolean(),
      // The type of the subagent that called the skill, null when the session itself did.
      agentType: z.string().nullable(),
    }),
    z.object({
      kind: z.literal("subagent"),
      at: z.iso.datetime(),
      agentId: z.string(),
      agentType: z.string(),
      description: z.string(),
      model: z.string().nullable(),
    }),
  ])
  .meta({ id: "ActivityEntry" });

export const subagentSummarySchema = z
  .object({
    agentId: z.string(),
    agentType: z.string(),
    model: z.string().nullable(),
    description: z.string(),
    launchedAt: z.iso.datetime(),
    toolCallCount: z.number().int(),
    isLogMissing: z.boolean(),
    tokens: tokenCountsSchema,
  })
  .meta({ id: "SubagentSummary" });

export const toolUsageSchema = z
  .object({
    name: z.string(),
    mcpServer: z.string().nullable(),
    callCount: z.number().int(),
    failedCount: z.number().int(),
  })
  .meta({ id: "ToolUsage" });

export const sessionDetailSchema = sessionSummarySchema
  .extend({
    workspace: z.object({ id: z.number().int(), name: z.string() }),
    usages: z.array(z.object({ model: z.string(), tokens: tokenCountsSchema })),
    activity: z.array(activityEntrySchema),
    subagents: z.array(subagentSummarySchema),
    tools: z.array(toolUsageSchema),
  })
  .meta({ id: "SessionDetail" });

export type TokenCounts = z.infer<typeof tokenCountsSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceList = z.infer<typeof workspaceListSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

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
  summary: "A session with its token usage per model, its activity, its subagents and its tools",
  request: { params: sessionParamsSchema },
  responses: {
    200: { description: "The session", content: { "application/json": { schema: sessionDetailSchema } } },
    404: notFound,
  },
});
