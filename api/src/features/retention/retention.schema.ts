import { z } from "zod";
import { registry } from "../../shared/openapi.js";

export const logRetentionStatusSchema = z
  .object({
    retentionDays: z.number().int(),
    // True: the setting is missing, unreadable or invalid, and Claude Code's default applies.
    isDefault: z.boolean(),
    // The oldest log file's last change; null when there is no log file.
    oldestLogAt: z.iso.datetime().nullable(),
    // The sessions whose log is gone and that only the database still holds.
    archivedSessionCount: z.number().int(),
    // The log files no refresh has read yet that Claude Code will delete within the warning window.
    unreadAtRisk: z.object({
      fileCount: z.number().int(),
      nearestDeletionAt: z.iso.datetime().nullable(),
    }),
  })
  .meta({ id: "LogRetentionStatus" });

export type LogRetentionStatus = z.infer<typeof logRetentionStatusSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/retention",
  summary: "Claude Code's log retention, the oldest log, and the unread logs about to be deleted",
  responses: {
    200: {
      description: "The log retention status",
      content: { "application/json": { schema: logRetentionStatusSchema } },
    },
  },
});
