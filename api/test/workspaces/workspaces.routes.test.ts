import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  sessionDetailSchema,
  workspaceDetailSchema,
  workspaceListSchema,
} from "../../src/features/workspaces/workspaces.schema.js";
import type { ProblemDetails } from "../../src/shared/errors.js";
import { buildPrompt, buildSession, buildUsage, buildWorkspace } from "../factories.js";
import { createTestContext } from "../setup.js";

describe("workspaces routes", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
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
    it("returns the session with its usages per model and its prompts in order", async () => {
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
      expect(body.prompts).toEqual([
        { position: 0, text: "First", sentAt: "2026-10-01T10:00:00.000Z" },
        { position: 1, text: "/review src", sentAt: "2026-10-01T10:05:00.000Z" },
        { position: 2, text: "Third\nwith a line break", sentAt: "2026-10-01T10:10:00.000Z" },
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
});
