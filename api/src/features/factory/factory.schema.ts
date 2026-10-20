import { z } from "zod";
import { registry } from "../../shared/openapi.js";

export const factoryRunStatusSchema = z.enum(["running", "waiting", "done", "interrupted"]).meta({ id: "FactoryRunStatus" });
export const factoryFeatureStateSchema = z
  .enum(["empty", "spec", "plan", "running", "review", "done"])
  .meta({ id: "FactoryFeatureState" });
export const factoryMarkerSchema = z.enum(["done", "running", "next", "pending"]).meta({ id: "FactoryMarker" });

export const factoryRunSchema = z
  .object({
    sessionId: z.string(),
    feature: z.string().nullable(),
    folder: z.string().nullable(),
    command: z.string(),
    step: z.string(),
    lastStep: z.string().nullable(),
    agentId: z.string().nullable(),
    status: factoryRunStatusSchema,
    since: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    // True: the history holds the session, so it has a page (FR-19).
    isStored: z.boolean(),
  })
  .meta({ id: "FactoryRun" });

export const factoryPromptSchema = z.object({ label: z.string(), prompt: z.string() }).meta({ id: "FactoryPrompt" });

export const factoryNextPromptSchema = z
  .object({
    label: z.string(),
    prompt: z.string(),
    all: z.union([factoryPromptSchema, z.null()]),
    autopilot: z.union([factoryPromptSchema, z.null()]),
  })
  .meta({ id: "FactoryNextPrompt" });

export const factoryPlanStageSchema = z
  .object({
    number: z.number().int(),
    title: z.string(),
    commit: z.string().nullable(),
    sha: z.string().nullable(),
    done: z.number().int(),
    total: z.number().int(),
  })
  .meta({ id: "FactoryPlanStage" });

export const factoryPlanSchema = z
  .object({
    folder: z.string(),
    title: z.string(),
    stages: z.array(factoryPlanStageSchema),
    validationDone: z.number().int(),
    validationTotal: z.number().int(),
    reviewDone: z.boolean(),
    isDraft: z.boolean(),
  })
  .meta({ id: "FactoryPlan" });

export const factoryTimelineStepSchema = z
  .object({
    step: z.string(),
    title: z.string(),
    detail: z.string(),
    marker: factoryMarkerSchema,
    runs: z.array(factoryRunSchema),
  })
  .meta({ id: "FactoryTimelineStep" });

export const factoryFeatureSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    state: factoryFeatureStateSchema,
    isNewPlan: z.boolean(),
    hasSpec: z.boolean(),
    specStatus: z.string().nullable(),
    plan: z.union([factoryPlanSchema, z.null()]),
    plans: z.array(z.string()),
    // Not `.nullable()`: on a shared entity the OpenAPI generator emits an unsatisfiable `allOf` with null.
    autopilot: z.union([factoryRunSchema, z.null()]),
    next: z.union([factoryNextPromptSchema, z.null()]),
    steps: z.array(factoryTimelineStepSchema),
  })
  .meta({ id: "FactoryFeature" });

export const factoryBoardSchema = z
  .object({
    fileName: z.string(),
    root: z.string(),
    branch: z.string().nullable(),
    baseBranch: z.string(),
    aheadCount: z.number().int().nullable(),
    changedCount: z.number().int(),
    scannedAt: z.iso.datetime(),
    // True: scanned more than 60 seconds ago, so no session of the project runs the mod (FR-11).
    isStale: z.boolean(),
    error: z.string().nullable(),
    // What the switches append to a prompt: `review` to a stage prompt, `browser` to an autopilot prompt (FR-18).
    markers: z.object({ review: z.string(), browser: z.string() }),
    live: z.array(factoryRunSchema),
    features: z.array(factoryFeatureSchema),
  })
  .meta({ id: "FactoryBoard" });

export const factoryWorkspaceSchema = z
  .object({
    // The workspace's path key, stable between two reads.
    key: z.string(),
    // Null: no refresh has stored this workspace yet (FR-03).
    workspaceId: z.number().int().nullable(),
    name: z.string(),
    path: z.string(),
    // True: a board that is not stale has a live run (FR-09).
    hasLiveRun: z.boolean(),
    counts: z.object({ running: z.number().int(), review: z.number().int() }),
    boards: z.array(factoryBoardSchema),
  })
  .meta({ id: "FactoryWorkspace" });

export const factoryUnsupportedFileSchema = z
  .object({
    fileName: z.string(),
    // Null: the file holds no numeric schemaVersion.
    schemaVersion: z.number().nullable(),
  })
  .meta({ id: "FactoryUnsupportedFile" });

export const factoryStateSchema = z
  .object({
    readAt: z.iso.datetime(),
    boardsDir: z.string(),
    // False: the boards folder is missing or cannot be listed (FR-06).
    isBoardsDirReadable: z.boolean(),
    unsupportedFiles: z.array(factoryUnsupportedFileSchema),
    workspaces: z.array(factoryWorkspaceSchema),
  })
  .meta({ id: "FactoryState" });

export type FactoryRun = z.infer<typeof factoryRunSchema>;
export type FactoryFeature = z.infer<typeof factoryFeatureSchema>;
export type FactoryBoard = z.infer<typeof factoryBoardSchema>;
export type FactoryWorkspace = z.infer<typeof factoryWorkspaceSchema>;
export type FactoryState = z.infer<typeof factoryStateSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/factory",
  summary: "Every factory board the factory-board mod exported, grouped by workspace",
  responses: {
    200: { description: "The factory boards", content: { "application/json": { schema: factoryStateSchema } } },
  },
});
