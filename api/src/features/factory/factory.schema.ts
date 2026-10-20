import { z } from "zod";
import { registry } from "../../shared/openapi.js";

export const factoryRunStatusSchema = z.enum(["running", "waiting", "done", "interrupted"]).meta({ id: "FactoryRunStatus" });
export const factoryFeatureStateSchema = z
  .enum(["empty", "spec", "plan", "running", "review", "done"])
  .meta({ id: "FactoryFeatureState" });
export const factoryMarkerSchema = z.enum(["done", "running", "next", "pending"]).meta({ id: "FactoryMarker" });

export const factoryPhaseSchema = z
  .enum(["working", "awaiting-commit", "awaiting-answer", "job-done", "interrupted"])
  .meta({ id: "FactoryPhase" });
export const factoryActivityPhaseSchema = z
  .enum(["working", "awaiting-commit", "awaiting-answer", "job-done", "interrupted", "idle"])
  .meta({ id: "FactoryActivityPhase" });

export const factoryRecapSchema = z
  .object({ text: z.string().nullable(), commits: z.array(z.object({ sha: z.string(), subject: z.string() })) })
  .meta({ id: "FactoryRecap" });

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
    // Null when the export carries none (an older export or run), never derived from the status (BR-02). It is read
    // with the status, as the mod's `runPhase` does.
    phase: z.union([factoryPhaseSchema, z.null()]),
    // The commit message the turn ended on.
    pendingCommit: z.string().nullable(),
    // The done footer of the turn.
    recap: z.union([factoryRecapSchema, z.null()]),
  })
  .meta({ id: "FactoryRun" });

// A session's latest main-loop run, phase always set by the mod (FR-28).
export const factorySessionSchema = factoryRunSchema.extend({ phase: factoryPhaseSchema }).meta({ id: "FactorySession" });

// FR-27: the mod's pick of the session that most needs the person, never recomputed here.
export const factoryActivitySchema = z
  .object({
    phase: factoryActivityPhaseSchema,
    sessionId: z.string().nullable(),
    feature: z.string().nullable(),
    step: z.string().nullable(),
    since: z.iso.datetime().nullable(),
    pendingCommit: z.string().nullable(),
    recap: z.union([factoryRecapSchema, z.null()]),
    isStored: z.boolean(),
  })
  .meta({ id: "FactoryActivity" });

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

// The factory and factory-board versions Claude Code installed; null when none is installed or the plugins file cannot
// be read. On a board: the install of its project (project or local scope first, else the user scope). From
// /v1/factory/plugins: the latest install or update, every scope together (FR-39).
export const factoryPluginVersionsSchema = z
  .object({ factory: z.string().nullable(), factoryBoard: z.string().nullable() })
  .meta({ id: "FactoryPluginVersions" });

export const factoryBoardSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
    // Null on a version 1 export.
    activity: z.union([factoryActivitySchema, z.null()]),
    // Empty on a version 1 export.
    sessions: z.array(factorySessionSchema),
    plugins: factoryPluginVersionsSchema,
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

// A step of the job's feature, without its runs: what the live tile's stage segments draw.
export const factoryJobStepSchema = z
  .object({ step: z.string(), title: z.string(), marker: factoryMarkerSchema })
  .meta({ id: "FactoryJobStep" });

// The feature of a job, reduced to what the live tile draws: the live poll never carries a whole board.
export const factoryJobFeatureSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    plan: z.union([factoryPlanSchema, z.null()]),
    autopilot: z.union([factoryRunSchema, z.null()]),
    next: z.union([factoryNextPromptSchema, z.null()]),
    steps: z.array(factoryJobStepSchema),
  })
  .meta({ id: "FactoryJobFeature" });

// The job of one live session, as factory-board FR-31 matches it over every board.
export const factorySessionJobSchema = z
  .object({
    fileName: z.string(),
    root: z.string(),
    // The board's staleness (FR-11): its runs are the state of the last scan.
    isStale: z.boolean(),
    scannedAt: z.iso.datetime(),
    markers: z.object({ review: z.string(), browser: z.string() }),
    // `live`: a run of the board's live list; `session`: its sessions list, the phase then always set.
    source: z.enum(["live", "session"]),
    // The run is the factory-board mod's record of a free request (live-sessions FR-34): it has a phase and a recap,
    // no feature and no step to draw.
    isOffWorkflow: z.boolean(),
    run: factoryRunSchema,
    // Null: the run has no feature, or the board does not list it.
    feature: z.union([factoryJobFeatureSchema, z.null()]),
  })
  .meta({ id: "FactorySessionJob" });

export type FactoryRun = z.infer<typeof factoryRunSchema>;
export type FactorySession = z.infer<typeof factorySessionSchema>;
export type FactoryActivity = z.infer<typeof factoryActivitySchema>;
export type FactoryRecap = z.infer<typeof factoryRecapSchema>;
export type FactoryFeature = z.infer<typeof factoryFeatureSchema>;
export type FactoryPluginVersions = z.infer<typeof factoryPluginVersionsSchema>;
export type FactoryBoard = z.infer<typeof factoryBoardSchema>;
export type FactoryWorkspace = z.infer<typeof factoryWorkspaceSchema>;
export type FactoryState = z.infer<typeof factoryStateSchema>;
export type FactoryJobFeature = z.infer<typeof factoryJobFeatureSchema>;
export type FactorySessionJob = z.infer<typeof factorySessionJobSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/factory",
  summary: "Every factory board the factory-board mod exported, grouped by workspace",
  responses: {
    200: { description: "The factory boards", content: { "application/json": { schema: factoryStateSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/factory/plugins",
  summary: "The factory and factory-board versions installed, for the header",
  responses: {
    200: {
      description: "The installed plugin versions",
      content: { "application/json": { schema: factoryPluginVersionsSchema } },
    },
  },
});
