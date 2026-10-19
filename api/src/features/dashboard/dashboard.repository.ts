import { and, count, eq, gte, isNotNull, sum, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  sessionModelUsages,
  sessions,
  skillCalls,
  subagentModelUsages,
  subagents,
  toolCalls,
  workspaces,
} from "../workspaces/workspaces.table.js";

export interface DashboardFilter {
  since: Date | null;
  workspaceId: number | null;
  includeScratch: boolean;
}

export interface TokenSums {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface WorkspaceCountRow {
  name: string;
  workspaceId: number;
  workspaceName: string;
  count: number;
}

export type WorkspaceTokenRow = { name: string; workspaceId: number; workspaceName: string } & TokenSums;

const workspaceColumns = { workspaceId: workspaces.id, workspaceName: workspaces.name };

const sessionTokenSums = {
  inputTokens: sum(sessionModelUsages.inputTokens),
  outputTokens: sum(sessionModelUsages.outputTokens),
  cacheReadTokens: sum(sessionModelUsages.cacheReadTokens),
  cacheWriteTokens: sum(sessionModelUsages.cacheWriteTokens),
};

const subagentTokenSums = {
  inputTokens: sum(subagentModelUsages.inputTokens),
  outputTokens: sum(subagentModelUsages.outputTokens),
  cacheReadTokens: sum(subagentModelUsages.cacheReadTokens),
  cacheWriteTokens: sum(subagentModelUsages.cacheWriteTokens),
};

// Drizzle returns a sum as a string (bigint), or null when no row was summed.
function toTokenSums(row: { [K in keyof TokenSums]: string | null }): TokenSums {
  return {
    inputTokens: Number(row.inputTokens ?? 0),
    outputTokens: Number(row.outputTokens ?? 0),
    cacheReadTokens: Number(row.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(row.cacheWriteTokens ?? 0),
  };
}

// BR-06: by start time. FR-14: the Scratch group is out unless shown, or unless it is the chosen workspace.
function sessionsWhere(filter: DashboardFilter): SQL | undefined {
  return and(
    filter.since === null ? undefined : gte(sessions.startedAt, filter.since),
    filter.workspaceId === null ? undefined : eq(sessions.workspaceId, filter.workspaceId),
    filter.workspaceId === null && !filter.includeScratch ? eq(workspaces.isScratch, false) : undefined,
  );
}

export function createDashboardRepository(db: Database) {
  return {
    async totals(filter: DashboardFilter) {
      const [counts] = await db
        .select({
          sessionCount: count(sessions.id),
          promptCount: sum(sessions.promptCount),
          toolCallCount: sum(sessions.toolCallCount),
          skillCallCount: sum(sessions.skillCallCount),
        })
        .from(sessions)
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter));
      const [launched] = await db
        .select({ subagentCount: count() })
        .from(subagents)
        .innerJoin(sessions, eq(sessions.id, subagents.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter));
      const [tokens] = await db
        .select(sessionTokenSums)
        .from(sessionModelUsages)
        .innerJoin(sessions, eq(sessions.id, sessionModelUsages.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter));
      return {
        sessionCount: counts?.sessionCount ?? 0,
        promptCount: Number(counts?.promptCount ?? 0),
        toolCallCount: Number(counts?.toolCallCount ?? 0),
        skillCallCount: Number(counts?.skillCallCount ?? 0),
        subagentCount: launched?.subagentCount ?? 0,
        tokens: toTokenSums(tokens ?? { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }),
      };
    },

    async agentTypeRuns(filter: DashboardFilter): Promise<WorkspaceCountRow[]> {
      return db
        .select({ name: subagents.agentType, ...workspaceColumns, count: count() })
        .from(subagents)
        .innerJoin(sessions, eq(sessions.id, subagents.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter))
        .groupBy(subagents.agentType, workspaces.id, workspaces.name);
    },

    async agentTypeTokens(filter: DashboardFilter): Promise<WorkspaceTokenRow[]> {
      const rows = await db
        .select({ name: subagents.agentType, ...workspaceColumns, ...subagentTokenSums })
        .from(subagentModelUsages)
        .innerJoin(
          subagents,
          and(eq(subagents.sessionId, subagentModelUsages.sessionId), eq(subagents.agentId, subagentModelUsages.agentId)),
        )
        .innerJoin(sessions, eq(sessions.id, subagents.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter))
        .groupBy(subagents.agentType, workspaces.id, workspaces.name);
      return rows.map((row) => ({ ...row, ...toTokenSums(row) }));
    },

    async skills(filter: DashboardFilter): Promise<WorkspaceCountRow[]> {
      return db
        .select({ name: skillCalls.name, ...workspaceColumns, count: count() })
        .from(skillCalls)
        .innerJoin(sessions, eq(sessions.id, skillCalls.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter))
        .groupBy(skillCalls.name, workspaces.id, workspaces.name);
    },

    async tools(filter: DashboardFilter): Promise<WorkspaceCountRow[]> {
      return db
        .select({ name: toolCalls.name, ...workspaceColumns, count: count() })
        .from(toolCalls)
        .innerJoin(sessions, eq(sessions.id, toolCalls.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter))
        .groupBy(toolCalls.name, workspaces.id, workspaces.name);
    },

    async mcpServers(filter: DashboardFilter): Promise<WorkspaceCountRow[]> {
      const rows = await db
        .select({ name: toolCalls.mcpServer, ...workspaceColumns, count: count() })
        .from(toolCalls)
        .innerJoin(sessions, eq(sessions.id, toolCalls.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(and(sessionsWhere(filter), isNotNull(toolCalls.mcpServer)))
        .groupBy(toolCalls.mcpServer, workspaces.id, workspaces.name);
      return rows.flatMap((row) => (row.name === null ? [] : [{ ...row, name: row.name }]));
    },

    async models(filter: DashboardFilter): Promise<WorkspaceTokenRow[]> {
      const rows = await db
        .select({ name: sessionModelUsages.model, ...workspaceColumns, ...sessionTokenSums })
        .from(sessionModelUsages)
        .innerJoin(sessions, eq(sessions.id, sessionModelUsages.sessionId))
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(sessionsWhere(filter))
        .groupBy(sessionModelUsages.model, workspaces.id, workspaces.name);
      return rows.map((row) => ({ ...row, ...toTokenSums(row) }));
    },

    // One row per session: the service puts each in its day, in the person's time zone.
    async sessionStarts(filter: DashboardFilter): Promise<({ startedAt: Date } & TokenSums)[]> {
      const rows = await db
        .select({ startedAt: sessions.startedAt, ...sessionTokenSums })
        .from(sessions)
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .leftJoin(sessionModelUsages, eq(sessionModelUsages.sessionId, sessions.id))
        .where(sessionsWhere(filter))
        .groupBy(sessions.id);
      return rows.map((row) => ({ startedAt: row.startedAt, ...toTokenSums(row) }));
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
