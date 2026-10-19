import { z } from "zod";
import { registry } from "../../shared/openapi.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "Liveness of the API",
  responses: {
    200: {
      description: "The API is up",
      content: { "application/json": { schema: healthResponseSchema } },
    },
  },
});
