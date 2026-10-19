import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveService } from "../../src/features/live/live.service.js";
import { createWorkspacesRepository } from "../../src/features/workspaces/workspaces.repository.js";
import { refreshStatusSchema } from "../../src/features/ingestion/ingestion.schema.js";
import { liveStateSchema, type LiveSession, type LiveState } from "../../src/features/live/live.schema.js";
import type { StatusFile } from "../../src/features/live/live.source.js";
import { sessions } from "../../src/features/workspaces/workspaces.table.js";
import { buildSession, buildWorkspace } from "../factories.js";
import {
  SESSION_ID,
  askUserQuestionBlock,
  assistantLine,
  queueLine,
  userLine,
  writeSession,
  type LogLine,
  type SubagentLog,
} from "../ingestion/log-builders.js";
import { createTestContext } from "../setup.js";
import { LIVE_STARTED_AT, at, callLine, promptLine, statusFile, writeStatusFile } from "./live-builders.js";

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
      async function startStoredCandidate() {
        await startSession({ pid: 11, lines: [promptLine("Go", 0)] });
      }

      it("starts a refresh that stores the session once its process is gone (FR-13)", async () => {
        // Arrange
        await startStoredCandidate();
        await getLive();
        ctx.alivePids.delete(11);

        // Act
        await getLive();
        await ctx.ingestion.whenIdle();

        // Assert
        await vi.waitFor(async () => expect(await storedIds()).toEqual([SESSION_ID]));
      });

      it("starts none on the first read", async () => {
        // Arrange
        await startStoredCandidate();

        // Act
        await getLive();

        // Assert
        await expectNoRefresh();
        expect(await storedIds()).toEqual([]);
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
        await ctx.ingestion.whenIdle();
        await vi.waitFor(async () => expect(await storedIds()).toEqual([SESSION_ID]));
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

