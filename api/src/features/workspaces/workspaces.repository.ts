import { asc, count, countDistinct, desc, eq, gt, inArray, max, sql, sum } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { ModelUsage, ParsedSession } from "../ingestion/ingestion.parser.js";
import type { ResolvedWorkspace } from "../ingestion/ingestion.workspace.js";
import {
  prompts,
  sessionModelUsages,
  sessions,
  skillCalls,
  subagentModelUsages,
  subagents,
  toolCalls,
  workspaces,
} from "./workspaces.table.js";

const sessionColumns = {
  id: sessions.id,
  title: sessions.title,
  startedAt: sessions.startedAt,
  endedAt: sessions.endedAt,
  gitBranch: sessions.gitBranch,
  origin: sessions.origin,
  promptCount: sessions.promptCount,
  subagentCount: sessions.subagentCount,
  isArchived: sessions.isArchived,
  toolCallCount: sessions.toolCallCount,
  failedToolCallCount: sessions.failedToolCallCount,
  skillCallCount: sessions.skillCallCount,
  agentTypes: sessions.agentTypes,
};

// Postgres caps a statement at 65,535 parameters: a long session's rows go in several inserts.
const INSERT_CHUNK = 500;

function chunks<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) result.push(rows.slice(start, start + INSERT_CHUNK));
  return result;
}

const usageColumns = {
  sessionId: sessionModelUsages.sessionId,
  model: sessionModelUsages.model,
  inputTokens: sessionModelUsages.inputTokens,
  outputTokens: sessionModelUsages.outputTokens,
  cacheReadTokens: sessionModelUsages.cacheReadTokens,
  cacheWriteTokens: sessionModelUsages.cacheWriteTokens,
};

export interface WorkspaceRow {
  id: number;
  name: string;
  path: string;
  isScratch: boolean;
  sessionCount: number;
  lastActivityAt: Date | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type SessionRow = {
  [K in keyof typeof sessionColumns]: (typeof sessions.$inferSelect)[K];
} & { usages: ModelUsage[] };

export function createWorkspacesRepository(db: Database) {
  async function listUsages(sessionIds: string[]): Promise<Map<string, ModelUsage[]>> {
    const bySession = new Map<string, ModelUsage[]>();
    if (sessionIds.length === 0) return bySession;
    const rows = await db
      .select(usageColumns)
      .from(sessionModelUsages)
      .where(inArray(sessionModelUsages.sessionId, sessionIds))
      .orderBy(asc(sessionModelUsages.model));
    for (const { sessionId, ...usage } of rows) {
      const usages = bySession.get(sessionId) ?? [];
      usages.push(usage);
      bySession.set(sessionId, usages);
    }
    return bySession;
  }

  return {
    async saveSession(workspace: ResolvedWorkspace, session: ParsedSession): Promise<"added" | "updated"> {
      return db.transaction(async (tx) => {
        // The first path seen for a workspace stays: case variants share its key.
        const [existingWorkspace] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.pathKey, workspace.pathKey));
        const workspaceId =
          existingWorkspace?.id ??
          (await tx.insert(workspaces).values(workspace).returning({ id: workspaces.id }))[0]?.id;
        if (workspaceId === undefined) throw new Error(`workspace ${workspace.pathKey} was not saved`);

        const deleted = await tx.delete(sessions).where(eq(sessions.id, session.sessionId)).returning({ id: sessions.id });
        await tx.insert(sessions).values({
          id: session.sessionId,
          workspaceId,
          title: session.title,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          gitBranch: session.gitBranch,
          origin: session.origin,
          promptCount: session.promptCount,
          subagentCount: session.subagentCount,
          isArchived: false,
          toolCallCount: session.toolCallCount,
          failedToolCallCount: session.failedToolCallCount,
          skillCallCount: session.skillCallCount,
          agentTypes: session.agentTypes,
        });
        const { sessionId } = session;
        // The delete above cascaded to the session's previous children.
        for (const rows of chunks(session.usages.map((usage) => ({ sessionId, ...usage })))) {
          await tx.insert(sessionModelUsages).values(rows);
        }
        const promptRows = session.prompts.map((prompt, position) => ({
          sessionId,
          position,
          text: prompt.text,
          sentAt: prompt.sentAt,
        }));
        for (const rows of chunks(promptRows)) await tx.insert(prompts).values(rows);
        for (const rows of chunks(session.toolCalls.map((call) => ({ sessionId, ...call })))) {
          await tx.insert(toolCalls).values(rows);
        }
        for (const rows of chunks(session.skillCalls.map((call, position) => ({ sessionId, position, ...call })))) {
          await tx.insert(skillCalls).values(rows);
        }
        const subagentRows = session.subagents.map((subagent) => ({
          sessionId,
          agentId: subagent.agentId,
          agentType: subagent.agentType,
          model: subagent.model,
          description: subagent.description,
          launchedAt: subagent.launchedAt,
          toolCallCount: subagent.toolCallCount,
          isLogMissing: subagent.isLogMissing,
        }));
        for (const rows of chunks(subagentRows)) await tx.insert(subagents).values(rows);
        const subagentUsageRows = session.subagents.flatMap((subagent) =>
          subagent.usages.map((usage) => ({ sessionId, agentId: subagent.agentId, ...usage })),
        );
        for (const rows of chunks(subagentUsageRows)) await tx.insert(subagentModelUsages).values(rows);
        return deleted.length > 0 ? "updated" : "added";
      });
    },

    async archiveSessions(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db.update(sessions).set({ isArchived: true }).where(inArray(sessions.id, ids));
    },

    async listSessionIds(filter: { isArchived: boolean }): Promise<string[]> {
      const rows = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.isArchived, filter.isArchived));
      return rows.map((row) => row.id);
    },

    async countSessions(filter: { isArchived: boolean }): Promise<number> {
      const [row] = await db.select({ total: count() }).from(sessions).where(eq(sessions.isArchived, filter.isArchived));
      return row?.total ?? 0;
    },

    // The ids among `ids` that the history holds, archived sessions included.
    async findStoredSessionIds(ids: string[]): Promise<Set<string>> {
      if (ids.length === 0) return new Set();
      const rows = await db.select({ id: sessions.id }).from(sessions).where(inArray(sessions.id, ids));
      return new Set(rows.map((row) => row.id));
    },

    async listWorkspaces(filter: { includeScratch: boolean }): Promise<WorkspaceRow[]> {
      const rows = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          path: workspaces.path,
          isScratch: workspaces.isScratch,
          sessionCount: countDistinct(sessions.id),
          lastActivityAt: max(sessions.endedAt),
          inputTokens: sum(sessionModelUsages.inputTokens),
          outputTokens: sum(sessionModelUsages.outputTokens),
          cacheReadTokens: sum(sessionModelUsages.cacheReadTokens),
          cacheWriteTokens: sum(sessionModelUsages.cacheWriteTokens),
        })
        .from(workspaces)
        .leftJoin(sessions, eq(sessions.workspaceId, workspaces.id))
        .leftJoin(sessionModelUsages, eq(sessionModelUsages.sessionId, sessions.id))
        .where(filter.includeScratch ? undefined : eq(workspaces.isScratch, false))
        .groupBy(workspaces.id)
        // A re-read session can move to another workspace (a repository created or removed since): the one it left may hold none.
        .having(gt(countDistinct(sessions.id), 0));
      return rows.map((row) => ({
        ...row,
        inputTokens: Number(row.inputTokens ?? 0),
        outputTokens: Number(row.outputTokens ?? 0),
        cacheReadTokens: Number(row.cacheReadTokens ?? 0),
        cacheWriteTokens: Number(row.cacheWriteTokens ?? 0),
      }));
    },

    async findWorkspace(id: number) {
      const [workspace] = await db
        .select({ id: workspaces.id, name: workspaces.name, path: workspaces.path, isScratch: workspaces.isScratch })
        .from(workspaces)
        .where(eq(workspaces.id, id));
      return workspace ?? null;
    },

    async listSessions(workspaceId: number): Promise<SessionRow[]> {
      const rows = await db.select(sessionColumns).from(sessions).where(eq(sessions.workspaceId, workspaceId));
      const usages = await listUsages(rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, usages: usages.get(row.id) ?? [] }));
    },

    async findSession(id: string) {
      const [row] = await db
        .select({ ...sessionColumns, workspace: { id: workspaces.id, name: workspaces.name } })
        .from(sessions)
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(eq(sessions.id, id));
      if (row === undefined) return null;
      const usages = await listUsages([id]);
      const sessionPrompts = await db
        .select({ position: prompts.position, text: prompts.text, sentAt: prompts.sentAt })
        .from(prompts)
        .where(eq(prompts.sessionId, id))
        .orderBy(asc(prompts.position));
      const sessionSkillCalls = await db
        .select({
          name: skillCalls.name,
          args: skillCalls.args,
          calledAt: skillCalls.calledAt,
          isTyped: skillCalls.isTyped,
          agentId: skillCalls.agentId,
          promptPosition: skillCalls.promptPosition,
        })
        .from(skillCalls)
        .where(eq(skillCalls.sessionId, id))
        .orderBy(asc(skillCalls.position));
      const sessionSubagents = await db
        .select({
          agentId: subagents.agentId,
          agentType: subagents.agentType,
          model: subagents.model,
          description: subagents.description,
          launchedAt: subagents.launchedAt,
          toolCallCount: subagents.toolCallCount,
          isLogMissing: subagents.isLogMissing,
        })
        .from(subagents)
        .where(eq(subagents.sessionId, id))
        .orderBy(asc(subagents.launchedAt), asc(subagents.agentId));
      const subagentUsages = await db
        .select({
          agentId: subagentModelUsages.agentId,
          model: subagentModelUsages.model,
          inputTokens: subagentModelUsages.inputTokens,
          outputTokens: subagentModelUsages.outputTokens,
          cacheReadTokens: subagentModelUsages.cacheReadTokens,
          cacheWriteTokens: subagentModelUsages.cacheWriteTokens,
        })
        .from(subagentModelUsages)
        .where(eq(subagentModelUsages.sessionId, id));
      const callCount = count();
      const tools = await db
        .select({
          name: toolCalls.name,
          mcpServer: toolCalls.mcpServer,
          callCount,
          failedCount: sql<number>`count(*) filter (where ${toolCalls.isError})`.mapWith(Number),
        })
        .from(toolCalls)
        .where(eq(toolCalls.sessionId, id))
        .groupBy(toolCalls.name, toolCalls.mcpServer)
        .orderBy(desc(callCount), asc(toolCalls.name));
      return {
        ...row,
        usages: usages.get(id) ?? [],
        prompts: sessionPrompts,
        skillCalls: sessionSkillCalls,
        subagents: sessionSubagents.map((subagent) => ({
          ...subagent,
          usages: subagentUsages.filter((usage) => usage.agentId === subagent.agentId),
        })),
        tools,
      };
    },
  };
}

export type WorkspacesRepository = ReturnType<typeof createWorkspacesRepository>;
