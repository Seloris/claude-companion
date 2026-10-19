import { z } from "zod";
import { problemDetailsSchema } from "../../shared/errors.js";
import { registry } from "../../shared/openapi.js";
import { tokenCountsSchema } from "../workspaces/workspaces.schema.js";

export const periodSchema = z.enum(["7d", "30d", "90d", "all"]).meta({ id: "DashboardPeriod" });

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const dashboardQuerySchema = z.object({
  period: periodSchema.default("30d"),
  workspaceId: z.coerce.number().int().positive().optional(),
  includeScratch: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // The days of the activity over time are the person's days: the web sends its IANA time zone.
  timeZone: z.string().min(1).refine(isTimeZone, { message: "Unknown time zone" }).default("UTC"),
});

const workspaceRef = { workspaceId: z.number().int(), workspaceName: z.string() };

export const countRankingSchema = z
  .object({
    name: z.string(),
    count: z.number().int(),
    byWorkspace: z.array(z.object({ ...workspaceRef, count: z.number().int() })),
  })
  .meta({ id: "CountRanking" });

export const agentTypeRankingSchema = z
  .object({
    name: z.string(),
    runCount: z.number().int(),
    tokens: tokenCountsSchema,
    byWorkspace: z.array(z.object({ ...workspaceRef, runCount: z.number().int(), tokens: tokenCountsSchema })),
  })
  .meta({ id: "AgentTypeRanking" });

export const modelRankingSchema = z
  .object({
    name: z.string(),
    tokens: tokenCountsSchema,
    byWorkspace: z.array(z.object({ ...workspaceRef, tokens: tokenCountsSchema })),
  })
  .meta({ id: "ModelRanking" });

export const dashboardSchema = z
  .object({
    period: z.object({ since: z.iso.datetime().nullable(), until: z.iso.datetime() }),
    workspaceId: z.number().int().nullable(),
    totals: z.object({
      sessionCount: z.number().int(),
      promptCount: z.number().int(),
      toolCallCount: z.number().int(),
      skillCallCount: z.number().int(),
      subagentCount: z.number().int(),
      tokens: tokenCountsSchema,
    }),
    agentTypes: z.array(agentTypeRankingSchema),
    skills: z.array(countRankingSchema),
    tools: z.array(countRankingSchema),
    mcpServers: z.array(countRankingSchema),
    models: z.array(modelRankingSchema),
    days: z.array(
      z.object({
        date: z.iso.date(),
        sessionCount: z.number().int(),
        tokens: tokenCountsSchema,
      }),
    ),
  })
  .meta({ id: "Dashboard" });

export type DashboardPeriod = z.infer<typeof periodSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/dashboard",
  summary: "Statistics of a period, over all workspaces or one: totals, rankings and activity per day",
  request: { query: dashboardQuerySchema },
  responses: {
    200: { description: "The dashboard", content: { "application/json": { schema: dashboardSchema } } },
    400: {
      description: "Invalid request",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  },
});
