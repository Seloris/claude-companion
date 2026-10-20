import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  sessionDetailSchema,
  workspaceDetailSchema,
  workspaceListSchema,
} from "../../src/features/workspaces/workspaces.schema.js";
import { sessions } from "../../src/features/workspaces/workspaces.table.js";
import type { ProblemDetails } from "../../src/shared/errors.js";
import {
  buildPrompt,
  buildSession,
  buildSkillCall,
  buildSubagent,
  buildToolCall,
  buildUsage,
  buildWorkspace,
} from "../factories.js";
import { createTestContext } from "../setup.js";

describe("workspaces routes", () => {
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

  async function workspaceIdOf(name: string): Promise<number> {
    const res = await request(ctx.app).get("/v1/workspaces?includeScratch=true");
    const workspace = workspaceListSchema.parse(res.body).workspaces.find((row) => row.name === name);
    if (workspace === undefined) throw new Error(`no workspace ${name}`);
    return workspace.id;
  }

  describe("GET /v1/workspaces", () => {
    async function seedThree() {
      const older = buildWorkspace({ name: "older" });
      const recent = buildWorkspace({ name: "recent" });
      const scratch = buildWorkspace({ pathKey: "scratch", name: "Scratch", path: "C:\\scratch", isScratch: true });
      await ctx.seed.session(older, buildSession({ endedAt: new Date("2026-09-01T10:00:00.000Z") }));
      await ctx.seed.session(
        recent,
        buildSession({
          endedAt: new Date("2026-10-01T10:00:00.000Z"),
          usages: [
            buildUsage({ model: "claude-opus-5-5" }),
            buildUsage({ model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }),
          ],
        }),
      );
      await ctx.seed.session(
        recent,
        buildSession({ endedAt: new Date("2026-09-15T10:00:00.000Z") }),
        { isArchived: true },
      );
      await ctx.seed.session(scratch, buildSession({ endedAt: new Date("2026-10-05T10:00:00.000Z") }));
    }

    it("lists the workspaces by last activity without the Scratch group", async () => {
      // Arrange
      await seedThree();

      // Act
      const res = await request(ctx.app).get("/v1/workspaces");

      // Assert
      expect(res.status).toBe(200);
      const body = workspaceListSchema.parse(res.body);
      expect(body.workspaces.map((workspace) => workspace.name)).toEqual(["recent", "older"]);
      expect(body.workspaces[0]).toMatchObject({
        sessionCount: 2,
        lastActivityAt: "2026-10-01T10:00:00.000Z",
        isScratch: false,
        tokens: { input: 201, output: 402, cacheRead: 603, cacheWrite: 804 },
      });
      expect(body.totals).toEqual({
        sessionCount: 3,
        tokens: { input: 301, output: 602, cacheRead: 903, cacheWrite: 1204 },
      });
    });

    it("includes the Scratch group and its tokens when asked", async () => {
      // Arrange
      await seedThree();

      // Act
      const res = await request(ctx.app).get("/v1/workspaces?includeScratch=true");

      // Assert
      expect(res.status).toBe(200);
      const body = workspaceListSchema.parse(res.body);
      expect(body.workspaces.map((workspace) => workspace.name)).toEqual(["Scratch", "recent", "older"]);
      expect(body.totals).toEqual({
        sessionCount: 4,
        tokens: { input: 401, output: 802, cacheRead: 1203, cacheWrite: 1604 },
      });
    });

    it("returns an empty list when nothing is stored", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/workspaces");

      // Assert
      expect(res.status).toBe(200);
      expect(workspaceListSchema.parse(res.body)).toEqual({
        workspaces: [],
        totals: { sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
      });
    });

    it("leaves out a workspace whose only session moved to another one", async () => {
      // Arrange
      const session = buildSession();
      await ctx.seed.session(buildWorkspace({ name: "before" }), session);
      await ctx.seed.session(buildWorkspace({ name: "after" }), session);

      // Act
      const res = await request(ctx.app).get("/v1/workspaces");

      // Assert
      expect(res.status).toBe(200);
      expect(workspaceListSchema.parse(res.body).workspaces.map((workspace) => workspace.name)).toEqual(["after"]);
    });

    it("returns 400 when includeScratch is not a boolean", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/workspaces?includeScratch=yes");

      // Assert
      expect(res.status).toBe(400);
      expect((res.body as ProblemDetails).errors).toHaveProperty(["query.includeScratch"]);
    });
  });

  describe("GET /v1/workspaces/:workspaceId", () => {
    it("lists the sessions most recent first with their duration and models", async () => {
      // Arrange
      const workspace = buildWorkspace({ name: "shop", path: "C:\\WS\\shop" });
      const older = buildSession({
        title: "Older",
        startedAt: new Date("2026-09-01T10:00:00.000Z"),
        endedAt: new Date("2026-09-01T10:30:00.000Z"),
      });
      const recent = buildSession({
        title: "Recent",
        startedAt: new Date("2026-10-01T10:00:00.000Z"),
        endedAt: new Date("2026-10-01T12:00:00.000Z"),
        gitBranch: "feat/cart",
        subagentCount: 2,
        toolCalls: [buildToolCall({ isError: true }), buildToolCall()],
        skillCalls: [buildSkillCall()],
        agentTypes: ["Explore", "factory:reviewer"],
        usages: [buildUsage({ model: "claude-haiku-5-5" }), buildUsage({ model: "claude-opus-5-5" })],
      });
      await ctx.seed.session(workspace, older, { isArchived: true });
      await ctx.seed.session(workspace, recent);
      const id = await workspaceIdOf("shop");

      // Act
      const res = await request(ctx.app).get(`/v1/workspaces/${id}`);

      // Assert
      expect(res.status).toBe(200);
      const body = workspaceDetailSchema.parse(res.body);
      expect(body).toMatchObject({ id, name: "shop", path: "C:\\WS\\shop", isScratch: false });
      expect(body.sessions.map((session) => session.title)).toEqual(["Recent", "Older"]);
      expect(body.sessions[0]).toEqual({
        id: recent.sessionId,
        title: "Recent",
        startedAt: "2026-10-01T10:00:00.000Z",
        endedAt: "2026-10-01T12:00:00.000Z",
        durationMs: 2 * 60 * 60 * 1000,
        models: ["claude-haiku-5-5", "claude-opus-5-5"],
        gitBranch: "feat/cart",
        origin: "cli",
        promptCount: 1,
        subagentCount: 2,
        isArchived: false,
        tokens: { input: 200, output: 400, cacheRead: 600, cacheWrite: 800 },
        toolCallCount: 2,
        failedToolCallCount: 1,
        skillCallCount: 1,
        agentTypes: ["Explore", "factory:reviewer"],
        desktopLink: null,
        resumeCommand: `pushd "C:\\WS\\demo"\nclaude --resume ${recent.sessionId}`,
      });
      expect(body.sessions[1]).toMatchObject({ isArchived: true, durationMs: 30 * 60 * 1000 });
    });

    it("returns 404 when the workspace does not exist", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/workspaces/999");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body as ProblemDetails).toMatchObject({ status: 404, code: "not_found" });
    });

    it("returns 400 when the id is not a number", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/workspaces/abc");

      // Assert
      expect(res.status).toBe(400);
      expect((res.body as ProblemDetails).errors).toHaveProperty(["params.workspaceId"]);
    });
  });

  describe("GET /v1/sessions/:sessionId", () => {
    it("returns the session with its usages per model and its prompts in its activity, in order", async () => {
      // Arrange
      const workspace = buildWorkspace({ name: "shop" });
      const session = buildSession({
        title: "Cart",
        usages: [buildUsage({ model: "claude-opus-5-5" }), buildUsage({ model: "claude-haiku-5-5", inputTokens: 5 })],
        prompts: [
          buildPrompt({ text: "First", sentAt: new Date("2026-10-01T10:00:00.000Z") }),
          buildPrompt({ text: "/review src", sentAt: new Date("2026-10-01T10:05:00.000Z") }),
          buildPrompt({ text: "Third\nwith a line break", sentAt: new Date("2026-10-01T10:10:00.000Z") }),
        ],
      });
      await ctx.seed.session(workspace, session);
      const workspaceId = await workspaceIdOf("shop");

      // Act
      const res = await request(ctx.app).get(`/v1/sessions/${session.sessionId}`);

      // Assert
      expect(res.status).toBe(200);
      const body = sessionDetailSchema.parse(res.body);
      expect(body).toMatchObject({ id: session.sessionId, title: "Cart", promptCount: 3, workspace: { id: workspaceId, name: "shop" } });
      expect(body.usages).toEqual([
        { model: "claude-haiku-5-5", tokens: { input: 5, output: 200, cacheRead: 300, cacheWrite: 400 } },
        { model: "claude-opus-5-5", tokens: { input: 100, output: 200, cacheRead: 300, cacheWrite: 400 } },
      ]);
      expect(body.activity).toEqual([
        { kind: "prompt", at: "2026-10-01T10:00:00.000Z", position: 0, text: "First" },
        { kind: "prompt", at: "2026-10-01T10:05:00.000Z", position: 1, text: "/review src" },
        { kind: "prompt", at: "2026-10-01T10:10:00.000Z", position: 2, text: "Third\nwith a line break" },
      ]);
    });

    it("interleaves the prompts, skill calls and subagents by time, a typed skill call shown once", async () => {
      // Arrange
      const workspace = buildWorkspace({ name: "shop" });
      const reviewer = buildSubagent({ agentId: "a1", launchedAt: new Date("2026-10-01T10:06:00.000Z") });
      const session = buildSession({
        prompts: [
          buildPrompt({ text: "Plan it", sentAt: new Date("2026-10-01T10:00:00.000Z") }),
          buildPrompt({ text: "/factory:implement plan", sentAt: new Date("2026-10-01T10:05:00.000Z") }),
        ],
        skillCalls: [
          buildSkillCall({
            name: "factory:implement",
            args: "plan",
            isTyped: true,
            promptPosition: 1,
            calledAt: new Date("2026-10-01T10:05:00.000Z"),
          }),
          buildSkillCall({ name: "caveman", agentId: "a1", calledAt: new Date("2026-10-01T10:07:00.000Z") }),
        ],
        subagents: [reviewer],
      });
      await ctx.seed.session(workspace, session);

      // Act
      const res = await request(ctx.app).get(`/v1/sessions/${session.sessionId}`);

      // Assert
      expect(res.status).toBe(200);
      expect(sessionDetailSchema.parse(res.body).activity).toEqual([
        { kind: "prompt", at: "2026-10-01T10:00:00.000Z", position: 0, text: "Plan it" },
        {
          kind: "skill",
          at: "2026-10-01T10:05:00.000Z",
          name: "factory:implement",
          args: "plan",
          isTyped: true,
          agentType: null,
        },
        {
          kind: "subagent",
          at: "2026-10-01T10:06:00.000Z",
          agentId: "a1",
          agentType: "factory:reviewer",
          description: "Review the stage",
          model: "claude-opus-5-5",
        },
        { kind: "skill", at: "2026-10-01T10:07:00.000Z", name: "caveman", args: null, isTyped: false, agentType: "factory:reviewer" },
      ]);
    });

    it("returns the subagents with their tokens and the tool calls summed per tool, failed ones apart", async () => {
      // Arrange
      const workspace = buildWorkspace({ name: "shop" });
      const session = buildSession({
        subagents: [
          buildSubagent({
            agentId: "a1",
            toolCallCount: 1,
            usages: [
              buildUsage({ model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }),
              buildUsage({ model: "claude-opus-5-5", inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }),
            ],
          }),
          buildSubagent({
            agentId: "toolu_missing",
            agentType: "Plan",
            model: null,
            usages: [],
            isLogMissing: true,
            launchedAt: new Date("2026-10-01T10:04:00.000Z"),
          }),
        ],
        toolCalls: [
          buildToolCall({ name: "Bash", isError: true }),
          buildToolCall({ name: "Bash" }),
          buildToolCall({ name: "Bash", isError: null }),
          buildToolCall({ name: "mcp__Claude_Browser__navigate", agentId: "a1" }),
        ],
      });
      await ctx.seed.session(workspace, session);

      // Act
      const res = await request(ctx.app).get(`/v1/sessions/${session.sessionId}`);

      // Assert
      const body = sessionDetailSchema.parse(res.body);
      expect(body.subagents).toEqual([
        {
          agentId: "a1",
          agentType: "factory:reviewer",
          model: "claude-opus-5-5",
          description: "Review the stage",
          launchedAt: "2026-10-01T10:03:00.000Z",
          toolCallCount: 1,
          isLogMissing: false,
          tokens: { input: 11, output: 22, cacheRead: 33, cacheWrite: 44 },
        },
        {
          agentId: "toolu_missing",
          agentType: "Plan",
          model: null,
          description: "Review the stage",
          launchedAt: "2026-10-01T10:04:00.000Z",
          toolCallCount: 0,
          isLogMissing: true,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ]);
      expect(body.tools).toEqual([
        { name: "Bash", mcpServer: null, callCount: 3, failedCount: 1 },
        { name: "mcp__Claude_Browser__navigate", mcpServer: "Claude_Browser", callCount: 1, failedCount: 0 },
      ]);
    });

    it("returns 404 when the session does not exist", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/sessions/unknown");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body as ProblemDetails).toMatchObject({ status: 404, code: "not_found" });
    });
  });

  describe("reopening a session", () => {
    const DESKTOP_ID = "local_8696f16a-1111-4222-8333-444455556666";
    const DESKTOP_LINK = `claude://claude.ai/epitaxy/${DESKTOP_ID}`;

    async function getSession(id: string) {
      const res = await request(ctx.app).get(`/v1/sessions/${id}`);
      expect(res.status).toBe(200);
      return sessionDetailSchema.parse(res.body);
    }

    async function getListedSession(workspaceName: string, id: string) {
      const res = await request(ctx.app).get(`/v1/workspaces/${await workspaceIdOf(workspaceName)}`);
      expect(res.status).toBe(200);
      const listed = workspaceDetailSchema.parse(res.body).sessions.find((session) => session.id === id);
      if (listed === undefined) throw new Error(`no session ${id} in ${workspaceName}`);
      return listed;
    }

    it("gives the two-line resume command with the folder the session started in", async () => {
      // Arrange
      const session = buildSession({ firstCwd: "C:\\WS\\my project" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);

      // Act
      const detail = await getSession(session.sessionId);
      const listed = await getListedSession("shop", session.sessionId);

      // Assert
      const expected = `pushd "C:\\WS\\my project"\nclaude --resume ${session.sessionId}`;
      expect(detail).toMatchObject({ resumeCommand: expected, desktopLink: null });
      expect(listed).toMatchObject({ resumeCommand: expected, desktopLink: null });
    });

    it("gives the folder of a worktree session, not the path of its workspace (BR-16)", async () => {
      // Arrange
      const worktree = "C:\\WS\\shop\\.claude\\worktrees\\feat-cart";
      const session = buildSession({ firstCwd: worktree });
      await ctx.seed.session(buildWorkspace({ name: "shop", path: "C:\\WS\\shop" }), session);

      // Act
      const detail = await getSession(session.sessionId);

      // Assert
      expect(detail.resumeCommand).toBe(`pushd "${worktree}"\nclaude --resume ${session.sessionId}`);
    });

    it("gives no resume command for an archived session (BR-17)", async () => {
      // Arrange
      const session = buildSession();
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session, { isArchived: true });

      // Act
      const detail = await getSession(session.sessionId);
      const listed = await getListedSession("shop", session.sessionId);

      // Assert
      expect(detail.resumeCommand).toBeNull();
      expect(listed.resumeCommand).toBeNull();
    });

    it("gives the desktop link and no resume command to a desktop-app session with a recorded id (BR-18)", async () => {
      // Arrange
      const session = buildSession({ origin: "claude-desktop" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);
      await ctx.seed.desktopSessionId(session.sessionId, DESKTOP_ID);

      // Act
      const detail = await getSession(session.sessionId);
      const listed = await getListedSession("shop", session.sessionId);

      // Assert
      expect(detail).toMatchObject({ desktopLink: DESKTOP_LINK, resumeCommand: null });
      expect(listed).toMatchObject({ desktopLink: DESKTOP_LINK, resumeCommand: null });
    });

    it("gives a CLI session no desktop link even with a recorded id, and its command (FR-16)", async () => {
      // Arrange
      const session = buildSession({ origin: "cli" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);
      await ctx.seed.desktopSessionId(session.sessionId, DESKTOP_ID);

      // Act
      const detail = await getSession(session.sessionId);

      // Assert
      expect(detail.desktopLink).toBeNull();
      expect(detail.resumeCommand).toBe(`pushd "C:\\WS\\demo"\nclaude --resume ${session.sessionId}`);
    });

    it("gives a desktop-app session with no recorded id its resume command (BR-19)", async () => {
      // Arrange
      const session = buildSession({ origin: "claude-desktop" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);

      // Act
      const detail = await getSession(session.sessionId);

      // Assert
      expect(detail.desktopLink).toBeNull();
      expect(detail.resumeCommand).not.toBeNull();
    });

    it("keeps the desktop link of an archived session (BR-19)", async () => {
      // Arrange
      const session = buildSession({ origin: "claude-desktop" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session, { isArchived: true });
      await ctx.seed.desktopSessionId(session.sessionId, DESKTOP_ID);

      // Act
      const detail = await getSession(session.sessionId);
      const listed = await getListedSession("shop", session.sessionId);

      // Assert
      expect(detail).toMatchObject({ desktopLink: DESKTOP_LINK, resumeCommand: null });
      expect(listed).toMatchObject({ desktopLink: DESKTOP_LINK, resumeCommand: null });
    });

    it("gives no resume command to a session not re-read yet, whose start folder is null", async () => {
      // Arrange
      const session = buildSession();
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);
      await ctx.db.update(sessions).set({ startFolder: null }).where(eq(sessions.id, session.sessionId));

      // Act
      const detail = await getSession(session.sessionId);

      // Assert
      expect(detail.resumeCommand).toBeNull();
    });

    it("gives no resume command for a folder a terminal cannot take literally (BR-20)", async () => {
      // Arrange
      const session = buildSession({ firstCwd: "C:\\WS\\$HOME" });
      await ctx.seed.session(buildWorkspace({ name: "shop" }), session);

      // Act
      const detail = await getSession(session.sessionId);

      // Assert
      expect(detail.resumeCommand).toBeNull();
    });
  });
});
