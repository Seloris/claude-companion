import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveService } from "../../src/features/live/live.service.js";
import { createWorkspacesRepository } from "../../src/features/workspaces/workspaces.repository.js";
import { refreshStatusSchema } from "../../src/features/ingestion/ingestion.schema.js";
import { liveStateSchema, type LiveSession, type LiveState } from "../../src/features/live/live.schema.js";
import type { StatusFile } from "../../src/features/live/live.source.js";
import { refreshRuns } from "../../src/features/ingestion/ingestion.table.js";
import { sessions } from "../../src/features/workspaces/workspaces.table.js";
import { buildSession, buildWorkspace } from "../factories.js";
import {
  NOW,
  buildBoardExport,
  buildExportFeature,
  buildExportRun,
  buildExportSession,
  writeBoard,
} from "../factory/factory-builders.js";
import {
  SESSION_ID,
  askUserQuestionBlock,
  assistantLine,
  queueLine,
  taskNotificationText,
  userLine,
  writeSession,
  type LogLine,
  type SubagentLog,
} from "../ingestion/log-builders.js";
import { createTestContext } from "../setup.js";
import { LIVE_STARTED_AT, at, callLine, promptLine, restartLine, statusFile, writeStatusFile } from "./live-builders.js";

const ms = (second: number) => LIVE_STARTED_AT + second * 1000;

describe("live routes", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  // A running process: its status file in the sessions folder, its pid alive, and its log when `lines` is given.
  async function startSession(options: {
    pid: number;
    sessionId?: string;
    status?: Partial<StatusFile>;
    lines?: LogLine[];
    folder?: string;
    subagents?: SubagentLog[];
  }) {
    const sessionId = options.sessionId ?? SESSION_ID;
    await writeStatusFile(ctx.sessionsDir, statusFile({ pid: options.pid, sessionId, ...options.status }));
    ctx.alivePids.add(options.pid);
    if (options.lines === undefined) return undefined;
    return writeSession(ctx.logsDir, options.folder ?? "C--WS-demo", {
      sessionId,
      lines: options.lines,
      ...(options.subagents === undefined ? {} : { subagents: options.subagents }),
    });
  }

  async function getLive(): Promise<LiveState> {
    const res = await request(ctx.app).get("/v1/live");
    expect(res.status).toBe(200);
    return liveStateSchema.parse(res.body);
  }

  async function getOnlySession(): Promise<LiveSession> {
    const state = await getLive();
    const sessionsOfState = state.workspaces.flatMap((workspace) => workspace.sessions);
    expect(sessionsOfState).toHaveLength(1);
    return sessionsOfState[0] as LiveSession;
  }

  async function storedIds(): Promise<string[]> {
    return (await ctx.db.select({ id: sessions.id }).from(sessions)).map((row) => row.id);
  }

  // The refresh a leaving session starts runs in the background: wait for it, then for what it stores.
  async function expectNoRefresh() {
    await ctx.ingestion.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await ctx.ingestion.whenIdle();
    const status = refreshStatusSchema.parse((await request(ctx.app).get("/v1/refresh")).body);
    expect(status.lastReport).toBeNull();
  }

  describe("GET /v1/live", () => {
    it("returns an empty state when no process runs", async () => {
      // Arrange
      ctx.clock.set("2026-10-01T10:10:00.000Z");

      // Act
      const state = await getLive();

      // Assert
      expect(state).toEqual({
        readAt: "2026-10-01T10:10:00.000Z",
        sessionsDir: ctx.sessionsDir,
        isSessionsDirReadable: true,
        counts: { running: 0, awaitingAnswer: 0, idle: 0 },
        workspaces: [],
      });
    });

    describe("status", () => {
      it.each([
        { status: "busy", waitingFor: undefined, expected: "running" },
        { status: "idle", waitingFor: undefined, expected: "idle" },
        { status: "waiting", waitingFor: "input needed", expected: "awaitingAnswer" },
        { status: "waiting", waitingFor: "dialog open", expected: "awaitingAnswer" },
        { status: "waiting", waitingFor: "a new kind of wait", expected: "awaitingAnswer" },
        { status: "waiting", waitingFor: "permission prompt", expected: "running" },
        { status: "waiting", waitingFor: "sandbox request", expected: "running" },
        { status: "waiting", waitingFor: "worker request", expected: "running" },
        { status: "waiting", waitingFor: "goal proposal", expected: "running" },
        { status: "waiting", waitingFor: undefined, expected: "running" },
        { status: "somethingNew", waitingFor: undefined, expected: "idle" },
      ])("maps the status $status waiting for $waitingFor to $expected", async ({ status, waitingFor, expected }) => {
        // Arrange
        await startSession({ pid: 11, status: { status, ...(waitingFor === undefined ? {} : { waitingFor }) } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.status).toBe(expected);
      });

      it("maps a status file without status to idle", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: undefined } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.status).toBe("idle");
      });

      it("counts the sessions per status, a permission wait among the running ones", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "s-1", status: { status: "busy" } });
        await startSession({ pid: 12, sessionId: "s-2", status: { status: "waiting", waitingFor: "permission prompt" } });
        await startSession({ pid: 13, sessionId: "s-3", status: { status: "waiting", waitingFor: "input needed" } });
        await startSession({ pid: 14, sessionId: "s-4", status: { status: "idle" } });
        await startSession({ pid: 15, sessionId: "s-5", status: { status: "idle" } });

        // Act
        const state = await getLive();

        // Assert
        expect(state.counts).toEqual({ running: 2, awaitingAnswer: 1, idle: 2 });
      });

      it("gives the time since the status changed, else since the file was updated, else since the start", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "s-1", status: { statusUpdatedAt: ms(100), updatedAt: ms(200) } });
        await startSession({ pid: 12, sessionId: "s-2", status: { statusUpdatedAt: undefined, updatedAt: ms(200) } });
        await startSession({ pid: 13, sessionId: "s-3", status: { statusUpdatedAt: undefined, updatedAt: undefined } });

        // Act
        const state = await getLive();

        // Assert
        const since = Object.fromEntries(
          state.workspaces.flatMap((workspace) => workspace.sessions).map((session) => [session.sessionId, session.statusSince]),
        );
        expect(since).toEqual({ "s-1": at(100), "s-2": at(200), "s-3": at(0) });
      });
    });

    describe("a session with a log", () => {
      it("describes the session from its status file and its log", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "busy", name: "Login work", entrypoint: "claude-desktop", statusUpdatedAt: ms(300) },
          lines: [
            userLine("Fix the login page", { timestamp: at(5), gitBranch: "feat/login", entrypoint: "cli" }),
            callLine("m1", "toolu_1", "Bash", { command: "npm test" }, 290),
          ],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toEqual({
          sessionId: SESSION_ID,
          title: "Fix the login page",
          status: "running",
          statusSince: at(300),
          startedAt: at(5),
          lastActivityAt: at(300),
          origin: "claude-desktop",
          gitBranch: "feat/login",
          desktopLink: null,
          isLogFound: true,
          isStored: false,
          lastPrompt: "Fix the login page",
          lastReply: null,
          turnStartedAt: at(5),
          question: null,
          questionCount: 0,
          waitingFor: null,
          queuedPrompts: [],
          currentActivity: { kind: "tool", toolName: "Bash", skill: null, since: at(290) },
          runningSubagents: [],
          factory: null,
        });
      });

      it("returns the last reply and the turn start of a session", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "idle" },
          lines: [
            promptLine("Fix the login page", 5),
            assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(8), content: [{ type: "text", text: "The login page is fixed." }] }),
          ],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ lastReply: "The login page is fixed.", turnStartedAt: at(5) });
      });

      it("moves the turn start to a notification that restarted Claude", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "idle", statusUpdatedAt: ms(70) },
          lines: [
            promptLine("Run the build in the background", 5),
            assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(8), content: [{ type: "text", text: "Started." }] }),
            restartLine("task-notification", taskNotificationText(["b1"], "completed"), 60),
            assistantLine("m2", "claude-opus-5-5", {}, { timestamp: at(65), content: [{ type: "text", text: "The build passed." }] }),
          ],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ lastReply: "The build passed.", turnStartedAt: at(60) });
      });

      it("has no turn when the last prompt predates the process", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "idle", startedAt: ms(100) },
          lines: [
            promptLine("Fix the login page", 5),
            assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(8), content: [{ type: "text", text: "The login page is fixed." }] }),
          ],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ lastPrompt: "Fix the login page", lastReply: null, turnStartedAt: null });
      });

      it("takes the origin of the log when the status file has none", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { entrypoint: undefined },
          lines: [userLine("Hello", { timestamp: at(5), entrypoint: "claude-vscode" })],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.origin).toBe("claude-vscode");
      });

      it("gives the desktop link of a desktop-app session (live-sessions FR-31)", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { entrypoint: "claude-desktop", hostSessionId: "local_8696f16a-1111-4222-8333-444455556666" },
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.desktopLink).toBe("claude://claude.ai/epitaxy/local_8696f16a-1111-4222-8333-444455556666");
      });

      it("gives no desktop link to a CLI session, whatever its status file holds", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { entrypoint: "cli", hostSessionId: "local_8696f16a-1111-4222-8333-444455556666" },
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.desktopLink).toBeNull();
      });

      it("keeps a session live and gives it no desktop link when its host session id is ill-formed", async () => {
        // Arrange
        await startSession({ pid: 11, status: { entrypoint: "claude-desktop", hostSessionId: "local_../../x" } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.desktopLink).toBeNull();
      });

      it("takes the name of the status file for a session whose log has no title yet", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { name: "Named in the app" },
          lines: [assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(5) })],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.title).toBe("Named in the app");
      });

      it("shows no activity for an idle session whose log ends on a call without result", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "idle" },
          lines: [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5)],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ status: "idle", currentActivity: null, runningSubagents: [] });
      });

      it("shows the agent a running session launched with its running subagents", async () => {
        // Arrange
        const subagent = {
          agentId: "a1",
          meta: { agentType: "factory:reviewer", description: "Review the stage", toolUseId: "toolu_agent" },
          lines: [promptLine("Review", 6), callLine("s1", "toolu_s1", "Grep", {}, 8)],
        };
        await startSession({
          pid: 11,
          status: { status: "busy" },
          lines: [
            promptLine("Go", 0),
            callLine("m1", "toolu_agent", "Agent", { subagent_type: "factory:reviewer", description: "Review the stage" }, 5),
          ],
          subagents: [subagent],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.currentActivity).toEqual({
          kind: "agent",
          agentType: "factory:reviewer",
          description: "Review the stage",
          skill: null,
          since: at(5),
        });
        expect(session.runningSubagents).toEqual([
          { agentId: "a1", agentType: "factory:reviewer", description: "Review the stage", currentTool: "Grep", since: at(5) },
        ]);
      });

      it("shows the question of a session that waits for an answer, and nothing of a session that does not", async () => {
        // Arrange
        const lines = [
          promptLine("Go", 0),
          assistantLine("m1", "claude-opus-5-5", {}, {
            timestamp: at(5),
            content: [askUserQuestionBlock("toolu_1", ["Which database?", "Which port?"])],
          }),
        ];
        await startSession({ pid: 11, status: { status: "waiting", waitingFor: "input needed" }, lines });

        // Act
        const waiting = await getOnlySession();

        // Assert
        expect(waiting).toMatchObject({
          status: "awaitingAnswer",
          question: "Which database?",
          questionCount: 2,
          waitingFor: "input needed",
          currentActivity: null,
        });
      });

      it("labels no question for a wait the log does not explain", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "waiting", waitingFor: "dialog open" },
          lines: [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5)],
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ status: "awaitingAnswer", question: null, questionCount: 0, waitingFor: "dialog open" });
      });

      it("lists the prompts queued behind a busy session and none behind an idle one", async () => {
        // Arrange
        const lines = [
          promptLine("Go", 0),
          queueLine("enqueue", "Then run the tests", { timestamp: at(3) }),
          queueLine("enqueue", "And commit", { timestamp: at(4) }),
        ];
        await startSession({ pid: 11, sessionId: SESSION_ID, status: { status: "busy" }, lines });
        const other = lines.map((line) => ({ ...line, sessionId: "idle-session" }));
        await startSession({ pid: 12, sessionId: "idle-session", status: { status: "idle" }, lines: other });

        // Act
        const state = await getLive();

        // Assert
        const bySession = Object.fromEntries(
          state.workspaces.flatMap((workspace) => workspace.sessions).map((session) => [session.sessionId, session.queuedPrompts]),
        );
        expect(bySession).toEqual({ [SESSION_ID]: ["Then run the tests", "And commit"], "idle-session": [] });
      });

      it("finds a log that moved to another folder", async () => {
        // Arrange
        const files = await startSession({
          pid: 11,
          status: { status: "busy" },
          lines: [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5)],
        });
        await getOnlySession();
        const moved = path.join(ctx.logsDir, "C--WS-moved");
        await mkdir(moved);
        await rename(files?.mainFile ?? "", path.join(moved, path.basename(files?.mainFile ?? "")));

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ isLogFound: true, currentActivity: { kind: "tool", toolName: "Bash" } });
      });

      it("reads a log again only when it changed", async () => {
        // Arrange
        const files = await startSession({
          pid: 11,
          status: { status: "busy" },
          lines: [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5)],
        });
        const mainFile = files?.mainFile ?? "";
        const before = await stat(mainFile);
        const first = await getOnlySession();

        // Act
        // Same size and modification time, content nobody can parse: a re-read would lose the log.
        await writeFile(mainFile, "x".repeat(before.size));
        await utimes(mainFile, before.atime, before.mtime);
        const second = await getOnlySession();
        await writeFile(mainFile, "y".repeat(before.size + 1));
        const third = await getOnlySession();

        // Assert
        expect(first.currentActivity).toMatchObject({ kind: "tool", toolName: "Bash" });
        expect(second.currentActivity).toEqual(first.currentActivity);
        expect(third).toMatchObject({ isLogFound: false, currentActivity: null });
      });
    });

    describe("a session without a readable log", () => {
      it("is live all the same, titled from the status file, with its start and no activity (BR-05)", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: "busy", name: "Just started", startedAt: ms(7) } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({
          title: "Just started",
          status: "running",
          startedAt: at(7),
          isLogFound: false,
          gitBranch: null,
          lastPrompt: null,
          lastReply: null,
          turnStartedAt: null,
          queuedPrompts: [],
          currentActivity: null,
          runningSubagents: [],
        });
      });

      it("returns no last reply and no turn start for a session too young to have a log", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: "busy" } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ isLogFound: false, lastReply: null, turnStartedAt: null });
      });

      it("is titled by its id when the status file has no name", async () => {
        // Arrange
        await startSession({ pid: 11, status: { name: undefined } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.title).toBe(SESSION_ID);
      });

      it("is live when its log has no working directory yet", async () => {
        // Arrange
        await startSession({ pid: 11, lines: [userLine("Hello", { cwd: "" })] });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ isLogFound: false, title: SESSION_ID });
      });
    });

    describe("liveness", () => {
      it("leaves out a session whose process is gone (BR-01)", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "alive" });
        await startSession({ pid: 12, sessionId: "gone" });
        ctx.alivePids.delete(12);

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.sessionId))).toEqual(["alive"]);
        expect(state.counts.idle).toBe(1);
      });

      it("keeps the status file with the latest update when two files name one session", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: "busy", updatedAt: ms(10), statusUpdatedAt: ms(10) } });
        await startSession({ pid: 12, status: { status: "idle", updatedAt: ms(20), statusUpdatedAt: ms(20) } });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ status: "idle", statusSince: at(20) });
      });

      it("lists the session of a live file when a dead file of the same session was updated later", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: "busy", updatedAt: ms(10), statusUpdatedAt: ms(10) } });
        await getOnlySession();
        await startSession({ pid: 12, status: { status: "idle", updatedAt: ms(20), statusUpdatedAt: ms(20) } });
        ctx.alivePids.delete(12);

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session).toMatchObject({ status: "running", statusSince: at(10) });
        await expectNoRefresh();
      });

      it("skips a status file whose times cannot be a date, and answers for the others", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "fine" });
        await startSession({ pid: 12, sessionId: "crafted", status: { startedAt: 1e20 } });

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.sessionId))).toEqual(["fine"]);
      });

      it("keeps the previous snapshot of a status file Claude Code is rewriting, and skips a new one it cannot read", async () => {
        // Arrange
        await startSession({ pid: 11, status: { status: "busy" } });
        await getOnlySession();
        await writeStatusFile(ctx.sessionsDir, statusFile({ pid: 11 }), { content: '{"pid": 11, "sessi' });
        await writeStatusFile(ctx.sessionsDir, statusFile({ pid: 12, sessionId: "never-read" }), { content: "{" });
        ctx.alivePids.add(12);

        // Act
        const state = await getLive();

        // Assert
        const listed = state.workspaces.flatMap((workspace) => workspace.sessions);
        expect(listed.map((session) => [session.sessionId, session.status])).toEqual([[SESSION_ID, "running"]]);
        await expectNoRefresh();
      });

      it("forgets a status file that was removed", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await getOnlySession();
        await rm(path.join(ctx.sessionsDir, "11.json"));

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces).toEqual([]);
      });

      it("lists a session another session started under its own workspace (BR-08)", async () => {
        // Arrange
        await startSession({
          pid: 11,
          sessionId: "child",
          status: { name: "Child task", cwd: "C:\\WS\\child" },
          lines: [
            userLine('<cross-session-message from="parent">Do the work</cross-session-message>', {
              sessionId: "child",
              cwd: "C:\\WS\\child",
              timestamp: at(5),
              extra: { origin: { kind: "peer" } },
            }),
          ],
        });
        await startSession({ pid: 12, sessionId: "parent", status: { cwd: "C:\\WS\\parent" } });

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces.map((workspace) => [workspace.name, workspace.sessions.map((session) => session.sessionId)])).toEqual(
          expect.arrayContaining([
            ["child", ["child"]],
            ["parent", ["parent"]],
          ]),
        );
        expect(state.workspaces).toHaveLength(2);
      });
    });

    describe("workspaces", () => {
      it("gathers a worktree under its repository and a scratch folder under the Scratch group (BR-06, FR-08)", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "main-checkout", status: { cwd: "C:\\WS\\demo" } });
        await startSession({
          pid: 12,
          sessionId: "in-worktree",
          status: { cwd: "C:\\somewhere\\else" },
          lines: [userLine("Go", { sessionId: "in-worktree", cwd: "C:\\WS\\Demo\\.claude\\worktrees\\feature-x", timestamp: at(5) })],
        });
        await startSession({ pid: 13, sessionId: "in-scratch", status: { cwd: path.join(ctx.scratchRoot, "abc-123") } });

        // Act
        const state = await getLive();

        // Assert
        const groups = state.workspaces.map((workspace) => ({
          key: workspace.key,
          name: workspace.name,
          isScratch: workspace.isScratch,
          sessions: workspace.sessions.map((session) => session.sessionId).sort(),
        }));
        expect(groups).toHaveLength(2);
        expect(groups).toContainEqual({
          key: "c:/ws/demo",
          name: "demo",
          isScratch: false,
          sessions: ["in-worktree", "main-checkout"],
        });
        expect(groups).toContainEqual({ key: "scratch", name: "Scratch", isScratch: true, sessions: ["in-scratch"] });
      });

      it("puts the workspaces holding a question first, then the most recently active, and in each the busiest sessions first", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "a-idle", status: { cwd: "C:\\WS\\a", status: "idle", statusUpdatedAt: ms(600) } });
        await startSession({ pid: 12, sessionId: "b-run", status: { cwd: "C:\\WS\\b", status: "busy", statusUpdatedAt: ms(300) } });
        await startSession({
          pid: 13,
          sessionId: "c-ask",
          status: { cwd: "C:\\WS\\c", status: "waiting", waitingFor: "input needed", statusUpdatedAt: ms(100) },
        });
        await startSession({ pid: 14, sessionId: "c-idle", status: { cwd: "C:\\WS\\c", status: "idle", statusUpdatedAt: ms(900) } });
        await startSession({ pid: 15, sessionId: "c-run-old", status: { cwd: "C:\\WS\\c", status: "busy", statusUpdatedAt: ms(200) } });
        await startSession({ pid: 16, sessionId: "c-run-new", status: { cwd: "C:\\WS\\c", status: "busy", statusUpdatedAt: ms(400) } });

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces.map((workspace) => [workspace.name, workspace.sessions.map((session) => session.sessionId)])).toEqual([
          ["c", ["c-ask", "c-run-new", "c-run-old", "c-idle"]],
          ["a", ["a-idle"]],
          ["b", ["b-run"]],
        ]);
      });

      it("counts the last line of a log as activity", async () => {
        // Arrange
        await startSession({
          pid: 11,
          sessionId: "quiet-status",
          status: { cwd: "C:\\WS\\a", statusUpdatedAt: ms(100) },
          lines: [userLine("Go", { sessionId: "quiet-status", cwd: "C:\\WS\\a", timestamp: at(500) })],
          folder: "C--WS-a",
        });
        await startSession({ pid: 12, sessionId: "other", status: { cwd: "C:\\WS\\b", statusUpdatedAt: ms(300) } });

        // Act
        const state = await getLive();

        // Assert
        expect(state.workspaces.map((workspace) => workspace.name)).toEqual(["a", "b"]);
        expect(state.workspaces[0]?.sessions[0]?.lastActivityAt).toBe(at(500));
      });
    });

    describe("link to the history", () => {
      it("tells which sessions the stored history holds, archived ones included", async () => {
        // Arrange
        const workspace = buildWorkspace({ name: "demo", path: "C:\\WS\\demo" });
        await ctx.seed.session(workspace, buildSession({ sessionId: "stored" }));
        await ctx.seed.session(workspace, buildSession({ sessionId: "archived" }), { isArchived: true });
        await startSession({ pid: 11, sessionId: "stored" });
        await startSession({ pid: 12, sessionId: "archived" });
        await startSession({ pid: 13, sessionId: "not-yet" });

        // Act
        const state = await getLive();

        // Assert
        const stored = Object.fromEntries(
          state.workspaces.flatMap((group) => group.sessions).map((session) => [session.sessionId, session.isStored]),
        );
        expect(stored).toEqual({ stored: true, archived: true, "not-yet": false });
      });
    });

    describe("factory job", () => {
      // The test clock starts at the builders' NOW, so a board scanned 5 s before it is fresh.
      const iso = (time: number) => new Date(time).toISOString();

      it("attaches the board's live run, its staleness, markers and feature to the live session", async () => {
        // Arrange
        await startSession({ pid: 11 });
        const folder = ".planning/features/demo/dev-plans/20261020-090000-demo";
        const run = buildExportRun({ sessionId: SESSION_ID, folder, phase: "working" });
        const step = { step: "stage:1", title: "Stage 1 · api", detail: "", marker: "running" as const, runs: [run] };
        const next = { label: "Stage 2 · web", prompt: `/factory:implement ${folder}/ — stage 2 (web)` };
        const plan = {
          folder,
          title: "Demo plan",
          stages: [{ number: 1, title: "api", commit: null, sha: null, done: 1, total: 2 }],
          validationDone: 0,
          validationTotal: 3,
          reviewDone: false,
          isDraft: false,
        };
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({ live: [run], features: [buildExportFeature({ plan, autopilot: run, next, steps: [step] })] }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        const servedRun = {
          sessionId: SESSION_ID,
          feature: "demo",
          folder,
          command: "implement",
          step: "stage:1",
          lastStep: null,
          agentId: null,
          status: "running",
          since: iso(run.since),
          updatedAt: iso(run.updatedAt),
          isStored: false,
          phase: "working",
          pendingCommit: null,
          recap: null,
        };
        expect(session.factory).toEqual({
          fileName: "C--WS-demo.json",
          root: "C:\\WS\\demo",
          isStale: false,
          scannedAt: iso(NOW - 5_000),
          markers: { review: " — with review", browser: " — with browser test" },
          source: "live",
          isOffWorkflow: false,
          run: servedRun,
          feature: {
            slug: "demo",
            title: "Demo feature",
            plan,
            autopilot: servedRun,
            next: { ...next, all: null, autopilot: null },
            steps: [{ step: "stage:1", title: "Stage 1 · api", marker: "running" }],
          },
        });
      });

      it("prefers a live run over the session entry of the same session", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({
            live: [buildExportRun({ sessionId: SESSION_ID, step: "stage:2", updatedAt: NOW - 60_000 })],
            sessions: [buildExportSession({ sessionId: SESSION_ID, step: "stage:1", updatedAt: NOW - 1_000 })],
          }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ source: "live", run: { step: "stage:2" } });
      });

      it("prefers the main loop over a subagent's run, then the latest change", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await startSession({ pid: 12, sessionId: "other" });
        await writeBoard(
          ctx.boardsDir,
          "a.json",
          buildBoardExport({
            root: "C:\\WS\\a",
            live: [
              buildExportRun({ sessionId: SESSION_ID, step: "stage:1", updatedAt: NOW - 60_000 }),
              buildExportRun({ sessionId: "other", step: "stage:1", updatedAt: NOW - 60_000 }),
            ],
          }),
        );
        await writeBoard(
          ctx.boardsDir,
          "b.json",
          buildBoardExport({
            root: "C:\\WS\\b",
            live: [
              buildExportRun({ sessionId: SESSION_ID, step: "stage:2", agentId: "agent-1", updatedAt: NOW - 1_000 }),
              buildExportRun({ sessionId: "other", step: "stage:2", updatedAt: NOW - 1_000 }),
            ],
          }),
        );

        // Act
        const state = await getLive();

        // Assert
        const steps = Object.fromEntries(
          state.workspaces.flatMap((workspace) => workspace.sessions).map((session) => [session.sessionId, session.factory?.run.step]),
        );
        expect(steps).toEqual({ [SESSION_ID]: "stage:1", other: "stage:2" });
      });

      it("takes the board's session entry when no live run names the session", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({
            sessions: [
              buildExportSession({ sessionId: SESSION_ID, step: "stage:1", phase: "interrupted", updatedAt: NOW - 60_000 }),
              buildExportSession({ sessionId: SESSION_ID, step: "stage:2", phase: "job-done", updatedAt: NOW - 1_000 }),
            ],
          }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ source: "session", run: { step: "stage:2", phase: "job-done" } });
      });

      it("keeps the phase and the recap of the session's off-workflow run, flagged off the workflow", async () => {
        // Arrange
        await startSession({ pid: 11 });
        const recap = { text: "The export is checked.", commits: [{ sha: "3a08238c4d5e6f708192a3b4c5d6e7f809a1b2c3", subject: "fix: export" }] };
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({
            live: [
              buildExportRun({
                sessionId: SESSION_ID,
                command: "off-workflow",
                step: "off-workflow",
                feature: null,
                status: "done",
                phase: "job-done",
                recap,
              }),
            ],
            sessions: [buildExportSession({ sessionId: SESSION_ID, updatedAt: NOW - 600_000 })],
          }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({
          source: "live",
          isOffWorkflow: true,
          feature: null,
          run: { command: "off-workflow", phase: "job-done", recap },
        });
      });

      it("keeps the pending commit of an off-workflow run waiting for its validation", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({
            live: [
              buildExportRun({
                sessionId: SESSION_ID,
                command: "off-workflow",
                step: "off-workflow",
                feature: null,
                status: "waiting",
                phase: "awaiting-commit",
                pendingCommit: "fix(demo): export",
              }),
            ],
          }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({
          isOffWorkflow: true,
          run: { phase: "awaiting-commit", pendingCommit: "fix(demo): export" },
        });
      });

      it("flags an off-workflow run of the board's session entries", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({
            sessions: [buildExportSession({ sessionId: SESSION_ID, command: "off-workflow", step: "off-workflow", feature: null })],
          }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ source: "session", isOffWorkflow: true });
      });

      it("flags a factory run as on the workflow", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(ctx.boardsDir, "C--WS-demo.json", buildBoardExport({ live: [buildExportRun({ sessionId: SESSION_ID })] }));

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ source: "live", isOffWorkflow: false });
      });

      it("keeps the job of a stale board, marked stale", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({ scannedAt: NOW - 60_001, sessions: [buildExportSession({ sessionId: SESSION_ID })] }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ isStale: true, scannedAt: iso(NOW - 60_001), source: "session" });
      });

      it("gives a null feature when the board does not list the run's feature", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(
          ctx.boardsDir,
          "C--WS-demo.json",
          buildBoardExport({ live: [buildExportRun({ sessionId: SESSION_ID, feature: "unlisted" })], features: [buildExportFeature()] }),
        );

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toMatchObject({ run: { feature: "unlisted" }, feature: null });
      });

      it("gives no factory job without a boards folder, and still answers 200", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await rm(ctx.boardsDir, { recursive: true });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toBeNull();
      });

      it("still answers, every session without a factory job, when the boards cannot be read", async () => {
        // Arrange
        await startSession({ pid: 11 });
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const service = createLiveService({
          workspacesRepo: createWorkspacesRepository(ctx.db),
          ingestion: ctx.ingestion,
          clock: ctx.clock,
          sessionsDir: ctx.sessionsDir,
          logsDir: ctx.logsDir,
          scratchRoot: ctx.scratchRoot,
          isPidAlive: (pid) => ctx.alivePids.has(pid),
          findRepoRoot: () => null,
          findFactoryJobs: () => Promise.reject(new Error("boards busy")),
        });

        // Act
        const first = await service.getLiveState();
        const second = await service.getLiveState();

        // Assert
        expect([first, second].map((state) => state.workspaces[0]?.sessions[0]?.factory)).toEqual([null, null]);
        expect(errors).toHaveBeenCalledTimes(1);
        errors.mockRestore();
      });

      it("ignores a board of an unsupported version", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await writeBoard(ctx.boardsDir, "C--WS-demo.json", {
          ...buildBoardExport({ live: [buildExportRun({ sessionId: SESSION_ID })] }),
          schemaVersion: 3,
        });

        // Act
        const session = await getOnlySession();

        // Assert
        expect(session.factory).toBeNull();
      });
    });

    describe("unreadable live state", () => {
      it("says so, with no session, when the sessions folder is missing (FR-12)", async () => {
        // Arrange
        await startSession({ pid: 11 });
        await rm(ctx.sessionsDir, { recursive: true });

        // Act
        const state = await getLive();

        // Assert
        expect(state).toMatchObject({
          sessionsDir: ctx.sessionsDir,
          isSessionsDirReadable: false,
          counts: { running: 0, awaitingAnswer: 0, idle: 0 },
          workspaces: [],
        });
      });
    });

    describe("refresh when a session leaves", () => {
      // Already stored: the history holds it, so only its leaving asks for a refresh (its missing-session refresh stays out of the way).
      async function startStoredCandidate() {
        await ctx.seed.session(buildWorkspace({ name: "demo", path: "C:\\WS\\demo" }), buildSession({ sessionId: SESSION_ID }));
        await startSession({ pid: 11, lines: [promptLine("Go", 0)] });
      }

      // The refresh a leave starts re-reads the session's log, which the seeded row never came from.
      async function expectRefreshRead() {
        await ctx.ingestion.whenIdle();
        await vi.waitFor(async () => {
          const status = refreshStatusSchema.parse((await request(ctx.app).get("/v1/refresh")).body);
          expect(status.lastReport?.sessionsRead).toBe(1);
        });
      }

      it("starts a refresh that reads the session again once its process is gone (FR-13)", async () => {
        // Arrange
        await startStoredCandidate();
        await getLive();
        await expectNoRefresh();
        ctx.alivePids.delete(11);

        // Act
        await getLive();

        // Assert
        await expectRefreshRead();
      });

      it("starts none on the first read", async () => {
        // Arrange
        await startStoredCandidate();

        // Act
        await getLive();

        // Assert
        await expectNoRefresh();
      });

      it("starts none while the live state is unreadable, and compares with the last good read after it", async () => {
        // Arrange
        await startStoredCandidate();
        await getLive();
        await rm(ctx.sessionsDir, { recursive: true });

        // Act
        const unreadable = await getLive();

        // Assert
        expect(unreadable.isSessionsDirReadable).toBe(false);
        await expectNoRefresh();
        await mkdir(ctx.sessionsDir);
        await getLive();
        await expectRefreshRead();
      });
    });

    describe("refresh when a session is missing from the history", () => {
      async function refreshRunCount(): Promise<number> {
        await ctx.ingestion.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 20));
        await ctx.ingestion.whenIdle();
        return (await ctx.db.select({ id: refreshRuns.id }).from(refreshRuns)).length;
      }

      it("starts a refresh that stores a session the history lacks, once its log is readable (FR-13)", async () => {
        // Arrange
        await startSession({ pid: 11, lines: [promptLine("Go", 0)] });

        // Act
        const first = await getOnlySession();
        await ctx.ingestion.whenIdle();

        // Assert
        expect(first.isStored).toBe(false);
        await vi.waitFor(async () => expect(await storedIds()).toEqual([SESSION_ID]));
        expect((await getOnlySession()).isStored).toBe(true);
      });

      it("starts none for a session without a log yet", async () => {
        // Arrange
        await startSession({ pid: 11 });

        // Act
        await getLive();

        // Assert
        await expectNoRefresh();
      });

      it("starts one refresh for several missing sessions", async () => {
        // Arrange
        await startSession({ pid: 11, sessionId: "a", lines: [promptLine("Go", 0, { sessionId: "a" })] });
        await startSession({ pid: 12, sessionId: "b", lines: [promptLine("Go", 0, { sessionId: "b" })] });

        // Act
        await getLive();

        // Assert
        expect(await refreshRunCount()).toBe(1);
        expect((await storedIds()).sort()).toEqual(["a", "b"]);
      });

      it("asks once per log, and again once the log of a session still missing changes", async () => {
        // Arrange
        const files = await startSession({ pid: 11, lines: [promptLine("Go", 0)] });
        await getLive();
        expect(await refreshRunCount()).toBe(1);
        // As if the refresh could not store it.
        await ctx.db.delete(sessions);

        // Act
        await getLive();
        const unchanged = await refreshRunCount();
        await writeSession(ctx.logsDir, "C--WS-demo", { lines: [promptLine("Go", 0), promptLine("Again", 10)] });
        await utimes(files?.mainFile ?? "", new Date(ms(20)), new Date(ms(20)));
        await getLive();

        // Assert
        expect(unchanged).toBe(1);
        expect(await refreshRunCount()).toBe(2);
      });
    });

    describe("overlapping reads", () => {
      it("shares one read between calls that overlap", async () => {
        // Arrange
        await startSession({ pid: 11 });
        const checked: number[] = [];
        const service = createLiveService({
          workspacesRepo: createWorkspacesRepository(ctx.db),
          ingestion: ctx.ingestion,
          clock: ctx.clock,
          sessionsDir: ctx.sessionsDir,
          logsDir: ctx.logsDir,
          scratchRoot: ctx.scratchRoot,
          isPidAlive: (pid) => {
            checked.push(pid);
            return true;
          },
          findRepoRoot: () => null,
          findFactoryJobs: async () => new Map(),
        });

        // Act
        const [first, second] = await Promise.all([service.getLiveState(), service.getLiveState()]);
        const third = await service.getLiveState();

        // Assert
        expect(second).toBe(first);
        expect(third).not.toBe(first);
        expect(checked).toEqual([11, 11]);
      });
    });

    describe("read only", () => {
      async function snapshotOf(dir: string): Promise<string[]> {
        const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
        const entries = await Promise.all(
          names.map(async (name) => {
            const info = await stat(path.join(dir, name));
            return `${name}:${info.isFile() ? info.size : "dir"}:${info.mtimeMs}`;
          }),
        );
        return entries.sort();
      }

      it("changes nothing in the sessions and logs folders (BR-07)", async () => {
        // Arrange
        await startSession({
          pid: 11,
          status: { status: "busy" },
          lines: [promptLine("Go", 0), callLine("m1", "toolu_1", "Agent", { description: "Look" }, 5)],
          subagents: [{ agentId: "a1", meta: { toolUseId: "toolu_1" }, lines: [promptLine("Look", 6)] }],
        });
        await writeFile(path.join(ctx.sessionsDir, "11.abcdef.key"), "credentials");
        const before = [await snapshotOf(ctx.sessionsDir), await snapshotOf(ctx.logsDir)];

        // Act
        await getLive();
        await getLive();
        ctx.alivePids.delete(11);
        await getLive();
        await ctx.ingestion.whenIdle();

        // Assert
        expect([await snapshotOf(ctx.sessionsDir), await snapshotOf(ctx.logsDir)]).toEqual(before);
        expect(before[0]).toHaveLength(2);
        expect(before[1]?.length).toBeGreaterThan(2);
      });
    });
  });
});

