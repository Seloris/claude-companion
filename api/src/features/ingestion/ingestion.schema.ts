import { z } from "zod";
import { problemDetailsSchema } from "../../shared/errors.js";
import { registry } from "../../shared/openapi.js";

export const refreshModeSchema = z.enum(["incremental", "full"]).meta({ id: "RefreshMode" });

export const refreshStartQuerySchema = z.object({ mode: refreshModeSchema.default("incremental") });

export const refreshReportSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    mode: refreshModeSchema,
    // Sessions parsed by the run: on a full refresh, every session re-read.
    sessionsRead: z.number().int(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int(),
    isLogsDirFound: z.boolean(),
    sessionsAdded: z.number().int(),
    sessionsUpdated: z.number().int(),
    sessionsArchived: z.number().int(),
    unreadableLines: z.number().int(),
  })
  .meta({ id: "RefreshReport" });

export const refreshStatusSchema = z
  .object({
    isRunning: z.boolean(),
    startedAt: z.iso.datetime().nullable(),
    logsDir: z.string(),
    lastReport: refreshReportSchema.nullable(),
  })
  .meta({ id: "RefreshStatus" });

export type RefreshMode = z.infer<typeof refreshModeSchema>;
export type RefreshReport = z.infer<typeof refreshReportSchema>;
export type RefreshStatus = z.infer<typeof refreshStatusSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/refresh",
  summary: "Whether a refresh runs, and the report of the last one",
  responses: {
    200: { description: "The refresh status", content: { "application/json": { schema: refreshStatusSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/refresh",
  summary: "Start a refresh, or return the one already running; a full refresh re-reads every log file",
  request: { query: refreshStartQuerySchema },
  responses: {
    202: { description: "The refresh runs", content: { "application/json": { schema: refreshStatusSchema } } },
    400: {
      description: "Invalid request",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  },
});
