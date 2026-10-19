import { eq } from "drizzle-orm";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshRuns } from "../../src/features/ingestion/ingestion.table.js";
import {
  sessionModelUsages,
  sessions,
  skillCalls,
  subagentModelUsages,
  subagents,
  toolCalls,
  workspaces,
} from "../../src/features/workspaces/workspaces.table.js";
import { createTestContext } from "../setup.js";
import { assistantLine, toJsonl, toolUseBlock, userLine, writeSession, type LogLine } from "./log-builders.js";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

describe("IngestionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  // Under the temp root: the repository-root walk never meets a .git folder of the host disk.
  function demo() {
    return path.join(ctx.tempRoot, "demo");
  }

  function session(sessionId: string, cwd: string, extra: LogLine[] = []) {
    return {
      sessionId,
      lines: [
        userLine("Go", { sessionId, cwd, timestamp: "2026-10-01T10:00:00.000Z" }),
        assistantLine(`msg_${sessionId}`, "claude-opus-5-5", { input: 10, output: 20 }, { sessionId, cwd }),
        ...extra,
      ],
    };
  }

  async function readSession(id: string) {
    const [row] = await ctx.db.select().from(sessions).where(eq(sessions.id, id));
    return row;
  }

  it("adds the new sessions and records the report", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));
    await writeSession(ctx.logsDir, "C--WS-demo", session(SECOND_ID, demo()));
    ctx.clock.set("2026-10-02T08:00:00.000Z");

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toEqual({
      status: "succeeded",
      mode: "incremental",
      sessionsRead: 2,
      startedAt: "2026-10-02T08:00:00.000Z",
      finishedAt: "2026-10-02T08:00:00.000Z",
      durationMs: 0,
      isLogsDirFound: true,
      sessionsAdded: 2,
      sessionsUpdated: 0,
      sessionsArchived: 0,
      unreadableLines: 0,
    });
    expect(await ctx.db.select({ id: sessions.id }).from(sessions)).toHaveLength(2);
    expect(await ctx.db.select().from(refreshRuns)).toHaveLength(1);
  });

  it("re-reads nothing when no file changed", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));
    await ctx.ingestion.refresh();

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsAdded: 0, sessionsUpdated: 0, sessionsArchived: 0 });
  });

  it("updates a session whose log file grew", async () => {
    // Arrange
    const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));
    await ctx.ingestion.refresh();
    await appendFile(
      mainFile,
      toJsonl([userLine("And the tests", { sessionId: FIRST_ID, timestamp: "2026-10-01T12:00:00.000Z" })]),
    );

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsAdded: 0, sessionsUpdated: 1 });
    expect(await readSession(FIRST_ID)).toMatchObject({
      promptCount: 2,
      endedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
  });

  it("updates a session when a subagent file appears and adds its tokens", async () => {
    // Arrange
    const first = session(FIRST_ID, demo());
    await writeSession(ctx.logsDir, "C--WS-demo", first);
    await ctx.ingestion.refresh();
    const subagent = [assistantLine("msg_sub", "claude-haiku-5-5", { input: 1, output: 2 }, { sessionId: FIRST_ID })];

    // Act
    await writeSession(ctx.logsDir, "C--WS-demo", { ...first, subagents: [subagent] });
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsUpdated: 1 });
    expect(await readSession(FIRST_ID)).toMatchObject({ subagentCount: 1 });
    const usages = await ctx.db
      .select({ model: sessionModelUsages.model, outputTokens: sessionModelUsages.outputTokens })
      .from(sessionModelUsages)
      .where(eq(sessionModelUsages.sessionId, FIRST_ID))
      .orderBy(sessionModelUsages.model);
    expect(usages).toEqual([
      { model: "claude-haiku-5-5", outputTokens: 2 },
      { model: "claude-opus-5-5", outputTokens: 20 },
    ]);
  });

  it("archives a session whose log file is gone and keeps it", async () => {
    // Arrange
    const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));
    await ctx.ingestion.refresh();
    await rm(mainFile);

    // Act
    const report = await ctx.ingestion.refresh();
    const again = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsArchived: 1 });
    expect(again).toMatchObject({ sessionsArchived: 0 });
    expect(await readSession(FIRST_ID)).toMatchObject({ isArchived: true, promptCount: 1 });
  });

  it("restores an archived session whose file came back, counted as updated", async () => {
    // Arrange
    const first = session(FIRST_ID, demo());
    const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", first);
    await ctx.ingestion.refresh();
    await rm(mainFile);
    await ctx.ingestion.refresh();

    // Act
    await writeSession(ctx.logsDir, "C--WS-demo", first);
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsAdded: 0, sessionsUpdated: 1 });
    expect(await readSession(FIRST_ID)).toMatchObject({ isArchived: false });
  });

  it("ignores a refresh asked for while one runs", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));

    // Act
    const [first, second] = await Promise.all([ctx.ingestion.start(), ctx.ingestion.start()]);
    await ctx.ingestion.whenIdle();

    // Assert
    expect(first.isRunning).toBe(true);
    expect(second.isRunning).toBe(true);
    expect(await ctx.db.select().from(refreshRuns)).toHaveLength(1);
    expect((await ctx.ingestion.getStatus()).isRunning).toBe(false);
  });

  it("leaves every file of the logs folder as it was", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", {
      ...session(FIRST_ID, demo()),
      subagents: [[assistantLine("msg_sub", "claude-haiku-5-5", { output: 1 }, { sessionId: FIRST_ID })]],
    });
    await mkdir(path.join(ctx.logsDir, "C--scratch", "memory"), { recursive: true });
    const before = await snapshot(ctx.logsDir);

    // Act
    await ctx.ingestion.refresh();
    await ctx.ingestion.refresh({ mode: "full" });

    // Assert
    expect(await snapshot(ctx.logsDir)).toEqual(before);
  });

  describe("activity", () => {
    function activeSession(sessionId: string, toolName: string) {
      return {
        sessionId,
        lines: [
          userLine("Go", { sessionId }),
          assistantLine("msg_1", "claude-opus-5-5", { output: 1 }, {
            sessionId,
            content: [
              toolUseBlock("toolu_1", toolName),
              toolUseBlock("toolu_agent", "Agent", { subagent_type: "Explore", description: "Find" }),
            ],
          }),
        ],
        subagents: [
          {
            agentId: "a1",
            meta: { agentType: "factory:runner", description: "Run the tests", toolUseId: "toolu_agent" },
            lines: [
              assistantLine("msg_s1", "claude-haiku-5-5", { input: 3, output: 4 }, {
                sessionId,
                content: [toolUseBlock("toolu_s1", "Skill", { skill: "caveman" })],
              }),
            ],
          },
        ],
      };
    }

    it("re-reads every session on a full refresh, and none on an incremental one when nothing changed", async () => {
      // Arrange
      await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));
      await writeSession(ctx.logsDir, "C--WS-demo", session(SECOND_ID, "C:\\WS\\demo"));
      await ctx.ingestion.refresh();

      // Act
      const incremental = await ctx.ingestion.refresh();
      const full = await ctx.ingestion.refresh({ mode: "full" });

      // Assert
      expect(incremental).toMatchObject({ mode: "incremental", sessionsRead: 0, sessionsUpdated: 0 });
      expect(full).toMatchObject({ mode: "full", sessionsRead: 2, sessionsAdded: 0, sessionsUpdated: 2 });
      expect(await ctx.db.select({ mode: refreshRuns.mode }).from(refreshRuns)).toContainEqual({ mode: "full" });
    });

    it("stores the tool calls, skill calls and subagents, the subagent read from its meta file", async () => {
      // Arrange
      await writeSession(ctx.logsDir, "C--WS-demo", activeSession(FIRST_ID, "Read"));

      // Act
      await ctx.ingestion.refresh();

      // Assert
      expect(await readSession(FIRST_ID)).toMatchObject({
        toolCallCount: 3,
        failedToolCallCount: 0,
        skillCallCount: 1,
        subagentCount: 1,
        agentTypes: ["factory:runner"],
      });
      const storedSubagents = await ctx.db.select().from(subagents).where(eq(subagents.sessionId, FIRST_ID));
      expect(storedSubagents).toMatchObject([
        { agentId: "a1", agentType: "factory:runner", description: "Run the tests", model: "claude-haiku-5-5", toolCallCount: 1 },
      ]);
      expect(await ctx.db.select().from(subagentModelUsages)).toMatchObject([
        { agentId: "a1", model: "claude-haiku-5-5", inputTokens: 3, outputTokens: 4 },
      ]);
      expect(await ctx.db.select({ name: skillCalls.name, agentId: skillCalls.agentId }).from(skillCalls)).toEqual([
        { name: "caveman", agentId: "a1" },
      ]);
    });

    it("replaces the stored activity of a session read again", async () => {
      // Arrange
      await writeSession(ctx.logsDir, "C--WS-demo", activeSession(FIRST_ID, "Read"));
      await ctx.ingestion.refresh();
      await writeSession(ctx.logsDir, "C--WS-demo", activeSession(FIRST_ID, "Write"));

      // Act
      await ctx.ingestion.refresh({ mode: "full" });

      // Assert
      const names = await ctx.db.select({ name: toolCalls.name }).from(toolCalls).where(eq(toolCalls.sessionId, FIRST_ID));
      expect(names.map((row) => row.name).sort()).toEqual(["Agent", "Skill", "Write"]);
      expect(await ctx.db.select().from(subagents)).toHaveLength(1);
      expect(await ctx.db.select().from(skillCalls)).toHaveLength(1);
      expect(await ctx.db.select().from(subagentModelUsages)).toHaveLength(1);
    });
  });

  it("puts a session of a repository subfolder and one of its worktree in the repository's workspace", async () => {
    // Arrange
    const repo = path.join(ctx.tempRoot, "repos", "shop");
    await mkdir(path.join(repo, ".git"), { recursive: true });
    await writeSession(ctx.logsDir, "shop-api", session(FIRST_ID, path.join(repo, "api")));
    await writeSession(
      ctx.logsDir,
      "shop-worktree",
      session(SECOND_ID, path.join(repo, ".claude", "worktrees", "brave-turing"), [
        userLine("Branch work", { sessionId: SECOND_ID, gitBranch: "claude/brave-turing" }),
      ]),
    );

    // Act
    await ctx.ingestion.refresh();

    // Assert
    const rows = await ctx.db.select({ path: workspaces.path, name: workspaces.name }).from(workspaces);
    expect(rows).toEqual([{ path: repo, name: "shop" }]);
    expect(await readSession(SECOND_ID)).toMatchObject({ gitBranch: "claude/brave-turing" });
  });

  it("keeps a session whose working directory changes in the workspace of the first one", async () => {
    // Arrange
    await writeSession(
      ctx.logsDir,
      "C--WS-demo",
      session(FIRST_ID, demo(), [
        userLine("Elsewhere", { sessionId: FIRST_ID, cwd: path.join(ctx.tempRoot, "other") }),
      ]),
    );

    // Act
    await ctx.ingestion.refresh();

    // Assert
    const rows = await ctx.db.select({ name: workspaces.name }).from(workspaces);
    expect(rows).toEqual([{ name: "demo" }]);
  });

  it("puts a session of the desktop app's scratch workspaces in the Scratch group", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "scratch", session(FIRST_ID, path.join(ctx.scratchRoot, "abc", "scratch-1")));

    // Act
    await ctx.ingestion.refresh();

    // Assert
    const rows = await ctx.db.select({ name: workspaces.name, isScratch: workspaces.isScratch }).from(workspaces);
    expect(rows).toEqual([{ name: "Scratch", isScratch: true }]);
  });

  describe("without a logs folder", () => {
    let missing: Awaited<ReturnType<typeof createTestContext>>;

    beforeAll(async () => {
      missing = await createTestContext({ logsDir: path.join(ctx.tempRoot, "does-not-exist") });
    });

    afterAll(async () => {
      await missing.dispose();
    });

    it("reports the folder as not found", async () => {
      // Act
      const report = await missing.ingestion.refresh();

      // Assert
      expect(report).toMatchObject({ status: "succeeded", isLogsDirFound: false, sessionsAdded: 0 });
    });
  });

  it("archives no session when the logs folder is not found", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, demo()));
    await ctx.ingestion.refresh();
    await rm(ctx.logsDir, { recursive: true });

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ isLogsDirFound: false, sessionsArchived: 0 });
    expect(await readSession(FIRST_ID)).toMatchObject({ isArchived: false });
  });
});

async function snapshot(dir: string): Promise<Record<string, { size: number; mtimeMs: number }>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Record<string, { size: number; mtimeMs: number }> = {};
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name);
    const stats = await stat(file);
    files[file] = { size: entry.isFile() ? stats.size : 0, mtimeMs: stats.mtimeMs };
  }
  return files;
}
