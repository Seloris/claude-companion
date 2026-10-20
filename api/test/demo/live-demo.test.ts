import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_SESSIONS, writeFreshBoard, writeLiveDemo } from "../../scripts/demo/live-demo.js";
import { factoryStateSchema } from "../../src/features/factory/factory.schema.js";
import { liveStateSchema, type LiveSession } from "../../src/features/live/live.schema.js";
import { createTestContext } from "../setup.js";

const NOW_ISO = "2026-10-20T12:00:00.000Z";
const NOW = Date.parse(NOW_ISO);
const PIDS = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010];

// The demo dataset of `npm run demo`, read through the real services: a shape drift breaks this test, not the browser test.
describe("live demo dataset", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.set(NOW_ISO);
    for (const pid of PIDS) ctx.alivePids.add(pid);
    await writeLiveDemo({ projectsDir: ctx.logsDir, sessionsDir: ctx.sessionsDir, boardsDir: ctx.boardsDir, now: NOW, pids: PIDS });
  });

  async function demoSessions(): Promise<LiveSession[]> {
    const res = await request(ctx.app).get("/v1/live");
    expect(res.status).toBe(200);
    const sessions = liveStateSchema.parse(res.body).workspaces.flatMap((workspace) => workspace.sessions);
    const byId = new Map(sessions.map((session) => [session.sessionId, session]));
    return DEMO_SESSIONS.map((demo) => {
      const session = byId.get(demo.sessionId);
      expect(session, demo.situation).toBeDefined();
      return session as LiveSession;
    });
  }

  it("serves the ten demo sessions with the situation each one stands for", async () => {
    // Act
    const [atWork, toCommit, question, jobDone, finished, interrupted, offWorkflow, cliCommit, resumed, offWorkflowDone] =
      await demoSessions();

    // Assert
    expect(atWork).toMatchObject({
      status: "running",
      currentActivity: { kind: "agent", agentType: "factory:reviewer" },
      factory: { source: "live", isStale: false, run: { command: "autopilot", status: "running" } },
    });
    expect(atWork?.runningSubagents.map((subagent) => subagent.currentTool).sort()).toEqual(["Bash", "Read"]);
    expect(atWork?.factory?.feature?.autopilot).not.toBeNull();

    expect(toCommit).toMatchObject({ status: "idle", factory: { isStale: false, run: { phase: "awaiting-commit" } } });
    expect(toCommit?.turnStartedAt).not.toBeNull();
    expect(toCommit?.desktopLink).toMatch(/^claude:\/\/claude\.ai\/epitaxy\/local_/);
    expect(toCommit?.factory?.run.pendingCommit?.split("\n").length).toBeGreaterThan(1);

    expect(question).toMatchObject({ status: "awaitingAnswer", questionCount: 2, factory: null });
    expect(question?.question).not.toBeNull();

    expect(jobDone).toMatchObject({ status: "idle", factory: { source: "session", run: { phase: "job-done" } } });
    expect(jobDone?.turnStartedAt).not.toBeNull();
    expect(jobDone?.factory?.run.recap?.commits).toHaveLength(1);
    expect(jobDone?.factory?.feature?.next).not.toBeNull();

    expect(finished).toMatchObject({ status: "idle", factory: null });
    expect(finished?.lastReply).not.toBeNull();

    expect(interrupted).toMatchObject({
      status: "idle",
      lastReply: null,
      factory: { isStale: true, run: { status: "interrupted" } },
    });
    expect(interrupted?.turnStartedAt).not.toBeNull();

    expect(offWorkflow).toMatchObject({
      status: "running",
      currentActivity: { kind: "tool", toolName: "Write" },
      factory: { isOffWorkflow: true, run: { phase: "working" } },
    });
    expect(offWorkflow?.queuedPrompts).toHaveLength(1);

    expect(cliCommit).toMatchObject({ desktopLink: null, factory: { run: { phase: "awaiting-commit" } } });

    expect(resumed).toMatchObject({ status: "idle", turnStartedAt: null });

    expect(offWorkflowDone).toMatchObject({
      status: "idle",
      factory: { isOffWorkflow: true, feature: null, run: { phase: "job-done", recap: { text: "The board export of a free request is checked." } } },
    });
    expect(offWorkflowDone?.turnStartedAt).not.toBeNull();
  });

  it("serves both demo boards, the billing one frozen", async () => {
    // Act
    const res = await request(ctx.app).get("/v1/factory");

    // Assert
    const boards = factoryStateSchema.parse(res.body).workspaces.flatMap((workspace) => workspace.boards);
    expect(boards.map((board) => [board.root.split(/[\\/]/).at(-1), board.isStale]).sort()).toEqual([
      ["billing-app", true],
      ["claude-companion", false],
    ]);
  });

  it("keeps the fresh board fresh once it is rewritten", async () => {
    // Arrange
    const later = NOW + 5 * 60_000;
    ctx.clock.set(new Date(later).toISOString());

    // Act
    await writeFreshBoard(ctx.boardsDir, later);
    const res = await request(ctx.app).get("/v1/factory");

    // Assert
    const boards = factoryStateSchema.parse(res.body).workspaces.flatMap((workspace) => workspace.boards);
    expect(boards.map((board) => [board.root.split(/[\\/]/).at(-1), board.isStale]).sort()).toEqual([
      ["billing-app", true],
      ["claude-companion", false],
    ]);
  });
});
