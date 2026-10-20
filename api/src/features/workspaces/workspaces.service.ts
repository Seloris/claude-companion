import { NotFoundError } from "../../shared/errors.js";
import type { ModelUsage } from "../ingestion/ingestion.parser.js";
import { DESKTOP_ENTRYPOINT, toDesktopLink, toResumeCommand } from "../ingestion/ingestion.reopen.js";
import type { SessionRow, WorkspacesRepository } from "./workspaces.repository.js";
import type {
  ActivityEntry,
  SessionDetail,
  SessionSummary,
  TokenCounts,
  WorkspaceDetail,
  WorkspaceList,
} from "./workspaces.schema.js";

export function createWorkspacesService({ workspacesRepo }: { workspacesRepo: WorkspacesRepository }) {
  return {
    async listWorkspaces(filter: { includeScratch: boolean }): Promise<WorkspaceList> {
      const rows = await workspacesRepo.listWorkspaces(filter);
      const workspaces = rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          path: row.path,
          isScratch: row.isScratch,
          sessionCount: row.sessionCount,
          lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
          tokens: {
            input: row.inputTokens,
            output: row.outputTokens,
            cacheRead: row.cacheReadTokens,
            cacheWrite: row.cacheWriteTokens,
          },
        }))
        .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
      // FR-09: the totals cover the rows shown, so the Scratch group counts only while it is listed.
      return {
        workspaces,
        totals: {
          sessionCount: workspaces.reduce((total, workspace) => total + workspace.sessionCount, 0),
          tokens: addTokens(workspaces.map((workspace) => workspace.tokens)),
        },
      };
    },

    async getWorkspace(id: number): Promise<WorkspaceDetail> {
      const workspace = await workspacesRepo.findWorkspace(id);
      if (workspace === null) throw new NotFoundError("Workspace", id);
      const sessions = await workspacesRepo.listSessions(id);
      return {
        ...workspace,
        sessions: sessions
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .map(toSessionSummary),
      };
    },

    async getSession(id: string): Promise<SessionDetail> {
      const session = await workspacesRepo.findSession(id);
      if (session === null) throw new NotFoundError("Session", id);
      const agentTypes = new Map(session.subagents.map((subagent) => [subagent.agentId, subagent.agentType]));
      // A typed skill call is one of the prompts: the timeline shows it once, as the skill call.
      const typedPositions = new Set(session.skillCalls.flatMap((call) => call.promptPosition ?? []));
      const entries: { at: Date; order: number; entry: ActivityEntry }[] = [
        ...session.prompts
          .filter((prompt) => !typedPositions.has(prompt.position))
          .map((prompt) => ({
            at: prompt.sentAt,
            order: 0,
            entry: { kind: "prompt" as const, at: prompt.sentAt.toISOString(), position: prompt.position, text: prompt.text },
          })),
        ...session.skillCalls.map((call) => ({
          at: call.calledAt,
          order: 1,
          entry: {
            kind: "skill" as const,
            at: call.calledAt.toISOString(),
            name: call.name,
            args: call.args,
            isTyped: call.isTyped,
            agentType: call.agentId === null ? null : (agentTypes.get(call.agentId) ?? null),
          },
        })),
        ...session.subagents.map((subagent) => ({
          at: subagent.launchedAt,
          order: 2,
          entry: {
            kind: "subagent" as const,
            at: subagent.launchedAt.toISOString(),
            agentId: subagent.agentId,
            agentType: subagent.agentType,
            description: subagent.description,
            model: subagent.model,
          },
        })),
      ];
      // Same time: the prompt first, then the skill it ran, then the agent the skill launched.
      entries.sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order);
      return {
        ...toSessionSummary(session),
        workspace: session.workspace,
        usages: session.usages.map((usage) => ({ model: usage.model, tokens: toTokens(usage) })),
        activity: entries.map(({ entry }) => entry),
        subagents: session.subagents.map((subagent) => ({
          agentId: subagent.agentId,
          agentType: subagent.agentType,
          model: subagent.model,
          description: subagent.description,
          launchedAt: subagent.launchedAt.toISOString(),
          toolCallCount: subagent.toolCallCount,
          isLogMissing: subagent.isLogMissing,
          tokens: addTokens(subagent.usages.map(toTokens)),
        })),
        tools: session.tools,
      };
    },
  };
}

export type WorkspacesService = ReturnType<typeof createWorkspacesService>;

function toSessionSummary(session: SessionRow): SessionSummary {
  // FR-16: a desktop-app origin; BR-19: the link outlives the process and the archive.
  const desktopLink = session.origin === DESKTOP_ENTRYPOINT ? toDesktopLink(session.desktopSessionId) : null;
  return {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    durationMs: session.endedAt.getTime() - session.startedAt.getTime(),
    models: session.usages.map((usage) => usage.model),
    gitBranch: session.gitBranch,
    origin: session.origin,
    promptCount: session.promptCount,
    subagentCount: session.subagentCount,
    isArchived: session.isArchived,
    tokens: addTokens(session.usages.map(toTokens)),
    toolCallCount: session.toolCallCount,
    failedToolCallCount: session.failedToolCallCount,
    skillCallCount: session.skillCallCount,
    agentTypes: session.agentTypes,
    desktopLink,
    // BR-17: no command for an archived session; BR-18: the link wins; BR-20: nor for a folder a terminal cannot take
    // literally. BR-15 (a live session) is the front's, which reads the live state.
    resumeCommand: session.isArchived || desktopLink !== null ? null : toResumeCommand(session.startFolder, session.id),
  };
}

function toTokens(usage: ModelUsage): TokenCounts {
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheWrite: usage.cacheWriteTokens,
  };
}

function addTokens(counts: TokenCounts[]): TokenCounts {
  return counts.reduce(
    (total, count) => ({
      input: total.input + count.input,
      output: total.output + count.output,
      cacheRead: total.cacheRead + count.cacheRead,
      cacheWrite: total.cacheWrite + count.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
}
