import { NotFoundError } from "../../shared/errors.js";
import type { ModelUsage } from "../ingestion/ingestion.parser.js";
import type { SessionRow, WorkspacesRepository } from "./workspaces.repository.js";
import type { SessionDetail, SessionSummary, TokenCounts, WorkspaceDetail, WorkspaceList } from "./workspaces.schema.js";

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
      return {
        ...toSessionSummary(session),
        workspace: session.workspace,
        usages: session.usages.map((usage) => ({ model: usage.model, tokens: toTokens(usage) })),
        prompts: session.prompts.map((prompt) => ({
          position: prompt.position,
          text: prompt.text,
          sentAt: prompt.sentAt.toISOString(),
        })),
      };
    },
  };
}

export type WorkspacesService = ReturnType<typeof createWorkspacesService>;

function toSessionSummary(session: SessionRow): SessionSummary {
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
