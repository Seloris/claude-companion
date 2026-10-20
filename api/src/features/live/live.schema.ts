import { z } from "zod";
import { registry } from "../../shared/openapi.js";

export const liveStatusSchema = z.enum(["running", "awaitingAnswer", "idle"]).meta({ id: "LiveStatus" });

const skill = z.string().nullable();

// What a running session does right now. `skill` is the skill it runs, a context of the step.
export const currentActivitySchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("tool"), toolName: z.string(), skill, since: z.iso.datetime() }),
    z.object({ kind: z.literal("agent"), agentType: z.string(), description: z.string(), skill, since: z.iso.datetime() }),
    z.object({ kind: z.literal("subagents"), skill, since: z.iso.datetime() }),
    z.object({ kind: z.literal("thinking"), skill, since: z.iso.datetime() }),
  ])
  .meta({ id: "CurrentActivity" });

export const runningSubagentSchema = z
  .object({
    agentId: z.string(),
    agentType: z.string(),
    description: z.string(),
    // Null: the subagent is thinking.
    currentTool: z.string().nullable(),
    since: z.iso.datetime(),
  })
  .meta({ id: "RunningSubagent" });

export const liveSessionSchema = z
  .object({
    sessionId: z.string(),
    title: z.string(),
    status: liveStatusSchema,
    statusSince: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    lastActivityAt: z.iso.datetime(),
    origin: z.string().nullable(),
    gitBranch: z.string().nullable(),
    // False: the log is missing or too young to be read, the session is known from Claude Code's status file only.
    isLogFound: z.boolean(),
    // True: the stored history holds the session, so it has a page.
    isStored: z.boolean(),
    lastPrompt: z.string().nullable(),
    // The last text Claude wrote in the latest turn, shortened; null without a turn or text.
    lastReply: z.string().nullable(),
    // The latest turn's start: the last prompt, or Claude Code restarting Claude (a background task's notification,
    // another session's message); null before the first turn.
    turnStartedAt: z.iso.datetime().nullable(),
    // The question Claude Code asked, shortened, for an awaitingAnswer session; null when it is not a question
    // (an elicitation, a dialog): `waitingFor` then says what it waits for.
    question: z.string().nullable(),
    questionCount: z.number().int(),
    waitingFor: z.string().nullable(),
    queuedPrompts: z.array(z.string()),
    // Null: the session is not running, or its activity is unknown (no log yet).
    currentActivity: currentActivitySchema.nullable(),
    runningSubagents: z.array(runningSubagentSchema),
  })
  .meta({ id: "LiveSession" });

export const liveWorkspaceSchema = z
  .object({
    // The workspace's path key, stable between two reads.
    key: z.string(),
    name: z.string(),
    isScratch: z.boolean(),
    sessions: z.array(liveSessionSchema),
  })
  .meta({ id: "LiveWorkspace" });

export const liveStateSchema = z
  .object({
    readAt: z.iso.datetime(),
    sessionsDir: z.string(),
    // False: the folder of Claude Code's live state is missing or cannot be listed; no session is returned then.
    isSessionsDirReadable: z.boolean(),
    counts: z.object({ running: z.number().int(), awaitingAnswer: z.number().int(), idle: z.number().int() }),
    workspaces: z.array(liveWorkspaceSchema),
  })
  .meta({ id: "LiveState" });

export type LiveStatus = z.infer<typeof liveStatusSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;
export type LiveWorkspace = z.infer<typeof liveWorkspaceSchema>;
export type LiveState = z.infer<typeof liveStateSchema>;

registry.registerPath({
  method: "get",
  path: "/v1/live",
  summary: "The Claude Code sessions running on this machine, grouped by workspace",
  responses: {
    200: { description: "The live state", content: { "application/json": { schema: liveStateSchema } } },
  },
});
