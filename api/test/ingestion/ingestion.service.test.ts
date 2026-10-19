import { eq } from "drizzle-orm";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshRuns } from "../../src/features/ingestion/ingestion.table.js";
import { sessionModelUsages, sessions, workspaces } from "../../src/features/workspaces/workspaces.table.js";
import { createTestContext } from "../setup.js";
import { assistantLine, toJsonl, userLine, writeSession, type LogLine } from "./log-builders.js";

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
    await ctx.reset();
  });

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
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));
    await writeSession(ctx.logsDir, "C--WS-demo", session(SECOND_ID, "C:\\WS\\demo"));
    ctx.clock.set("2026-10-02T08:00:00.000Z");

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toEqual({
      status: "succeeded",
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
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));
    await ctx.ingestion.refresh();

    // Act
    const report = await ctx.ingestion.refresh();

    // Assert
    expect(report).toMatchObject({ sessionsAdded: 0, sessionsUpdated: 0, sessionsArchived: 0 });
  });

  it("updates a session whose log file grew", async () => {
    // Arrange
    const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));
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
    const first = session(FIRST_ID, "C:\\WS\\demo");
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
    const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));
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
    const first = session(FIRST_ID, "C:\\WS\\demo");
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
    await writeSession(ctx.logsDir, "C--WS-demo", session(FIRST_ID, "C:\\WS\\demo"));

    // Act
    const first = await ctx.ingestion.start();
    const second = await ctx.ingestion.start();
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
      ...session(FIRST_ID, "C:\\WS\\demo"),
      subagents: [[assistantLine("msg_sub", "claude-haiku-5-5", { output: 1 }, { sessionId: FIRST_ID })]],
    });
    await mkdir(path.join(ctx.logsDir, "C--scratch", "memory"), { recursive: true });
    const before = await snapshot(ctx.logsDir);

    // Act
    await ctx.ingestion.refresh();

    // Assert
    expect(await snapshot(ctx.logsDir)).toEqual(before);
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
      session(FIRST_ID, "C:\\WS\\demo", [userLine("Elsewhere", { sessionId: FIRST_ID, cwd: "C:\\WS\\other" })]),
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

    it("reports the folder as not found", async () => {
      // Act
      const report = await missing.ingestion.refresh();

      // Assert
      expect(report).toMatchObject({ status: "succeeded", isLogsDirFound: false, sessionsAdded: 0 });
    });
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
