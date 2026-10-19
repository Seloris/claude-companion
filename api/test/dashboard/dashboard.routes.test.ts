import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dashboardSchema } from "../../src/features/dashboard/dashboard.schema.js";
import { workspaceListSchema } from "../../src/features/workspaces/workspaces.schema.js";
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

const NOW = "2026-10-19T12:00:00.000Z";

describe("dashboard routes", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.set(NOW);
  });

  async function workspaceIdOf(name: string): Promise<number> {
    const res = await request(ctx.app).get("/v1/workspaces?includeScratch=true");
    const workspace = workspaceListSchema.parse(res.body).workspaces.find((row) => row.name === name);
    if (workspace === undefined) throw new Error(`no workspace ${name}`);
    return workspace.id;
  }

  async function getDashboard(query: string) {
    const res = await request(ctx.app).get(`/v1/dashboard${query}`);
    expect(res.status).toBe(200);
    return dashboardSchema.parse(res.body);
  }

  function sessionOn(day: string, overrides: Parameters<typeof buildSession>[0] = {}) {
    return buildSession({
      startedAt: new Date(`${day}T10:00:00.000Z`),
      endedAt: new Date(`${day}T11:00:00.000Z`),
      ...overrides,
    });
  }

  describe("GET /v1/dashboard", () => {
    it("sums the sessions of the last 30 days by default", async () => {
      // Arrange
      const shop = buildWorkspace({ name: "shop" });
      await ctx.seed.session(
        shop,
        sessionOn("2026-10-10", {
          prompts: [buildPrompt(), buildPrompt()],
          toolCalls: [buildToolCall(), buildToolCall()],
          skillCalls: [buildSkillCall()],
          subagents: [buildSubagent(), buildSubagent({ isLogMissing: true, usages: [] })],
        }),
      );
      await ctx.seed.session(shop, sessionOn("2026-10-12"), { isArchived: true });
      await ctx.seed.session(shop, sessionOn("2026-08-01"));

      // Act
      const dashboard = await getDashboard("");

      // Assert
      expect(dashboard.period).toEqual({ since: "2026-09-19T12:00:00.000Z", until: NOW });
      expect(dashboard.workspaceId).toBeNull();
      expect(dashboard.totals).toEqual({
        sessionCount: 2,
        promptCount: 3,
        toolCallCount: 2,
        skillCallCount: 1,
        subagentCount: 2,
        tokens: { input: 200, output: 400, cacheRead: 600, cacheWrite: 800 },
      });
    });

    it("leaves out a session started before the period even when it ended inside it", async () => {
      // Arrange
      const shop = buildWorkspace({ name: "shop" });
      await ctx.seed.session(
        shop,
        buildSession({
          startedAt: new Date("2026-10-11T23:00:00.000Z"),
          endedAt: new Date("2026-10-13T10:00:00.000Z"),
        }),
      );
      await ctx.seed.session(shop, sessionOn("2026-10-15"));

      // Act
      const dashboard = await getDashboard("?period=7d");

      // Assert
      expect(dashboard.totals.sessionCount).toBe(1);
    });

    it("covers every session with the all-time period", async () => {
      // Arrange
      const shop = buildWorkspace({ name: "shop" });
      await ctx.seed.session(shop, sessionOn("2025-01-01"));
      await ctx.seed.session(shop, sessionOn("2026-10-15"));

      // Act
      const dashboard = await getDashboard("?period=all");

      // Assert
      expect(dashboard.period.since).toBeNull();
      expect(dashboard.totals.sessionCount).toBe(2);
    });

    it("filters on one workspace, without the per-workspace breakdown", async () => {
      // Arrange
      await ctx.seed.session(buildWorkspace({ name: "shop" }), sessionOn("2026-10-10", { skillCalls: [buildSkillCall()] }));
      await ctx.seed.session(buildWorkspace({ name: "blog" }), sessionOn("2026-10-10", { skillCalls: [buildSkillCall()] }));
      const shopId = await workspaceIdOf("shop");

      // Act
      const dashboard = await getDashboard(`?workspaceId=${shopId}`);

      // Assert
      expect(dashboard.workspaceId).toBe(shopId);
      expect(dashboard.totals.sessionCount).toBe(1);
      expect(dashboard.skills).toEqual([{ name: "factory:implement", count: 1, byWorkspace: [] }]);
    });

    it("leaves the Scratch group out unless it is shown or chosen", async () => {
      // Arrange
      const scratch = buildWorkspace({ pathKey: "scratch", name: "Scratch", path: "C:\\scratch", isScratch: true });
      await ctx.seed.session(scratch, sessionOn("2026-10-10"));
      await ctx.seed.session(buildWorkspace({ name: "shop" }), sessionOn("2026-10-10"));
      const scratchId = await workspaceIdOf("Scratch");

      // Act
      const hidden = await getDashboard("");
      const shown = await getDashboard("?includeScratch=true");
      const chosen = await getDashboard(`?workspaceId=${scratchId}`);

      // Assert
      expect(hidden.totals.sessionCount).toBe(1);
      expect(shown.totals.sessionCount).toBe(2);
      expect(chosen.totals.sessionCount).toBe(1);
    });

    it("ranks the agent types, skills, tools, MCP servers and models with their breakdown per workspace", async () => {
      // Arrange
      const shop = buildWorkspace({ name: "shop" });
      const blog = buildWorkspace({ name: "blog" });
      const runnerUsage = buildUsage({ model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 });
      await ctx.seed.session(
        shop,
        sessionOn("2026-10-10", {
          usages: [buildUsage({ model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 0 })],
          subagents: [
            buildSubagent({ agentType: "runner", usages: [runnerUsage] }),
            buildSubagent({ agentType: "runner", usages: [runnerUsage] }),
            buildSubagent({ agentType: "factory:reviewer" }),
          ],
          skillCalls: [buildSkillCall({ name: "factory:implement" }), buildSkillCall({ name: "caveman" })],
          toolCalls: [
            buildToolCall({ name: "Bash" }),
            buildToolCall({ name: "mcp__Claude_Browser__navigate" }),
            buildToolCall({ name: "mcp__Claude_Browser__computer" }),
          ],
        }),
      );
      await ctx.seed.session(
        blog,
        sessionOn("2026-10-11", {
          usages: [buildUsage({ model: "claude-haiku-5-5", inputTokens: 5, outputTokens: 5 })],
          subagents: [buildSubagent({ agentType: "runner", usages: [] })],
          skillCalls: [buildSkillCall({ name: "caveman" }), buildSkillCall({ name: "caveman" })],
          toolCalls: [buildToolCall({ name: "Bash" }), buildToolCall({ name: "Bash" })],
        }),
      );
      const shopId = await workspaceIdOf("shop");
      const blogId = await workspaceIdOf("blog");

      // Act
      const dashboard = await getDashboard("");

      // Assert
      expect(dashboard.agentTypes).toEqual([
        {
          name: "runner",
          runCount: 3,
          tokens: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0 },
          byWorkspace: [
            { workspaceId: shopId, workspaceName: "shop", runCount: 2, tokens: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0 } },
            { workspaceId: blogId, workspaceName: "blog", runCount: 1, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
          ],
        },
        {
          name: "factory:reviewer",
          runCount: 1,
          tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
          byWorkspace: [
            { workspaceId: shopId, workspaceName: "shop", runCount: 1, tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 } },
          ],
        },
      ]);
      expect(dashboard.skills).toEqual([
        {
          name: "caveman",
          count: 3,
          byWorkspace: [
            { workspaceId: blogId, workspaceName: "blog", count: 2 },
            { workspaceId: shopId, workspaceName: "shop", count: 1 },
          ],
        },
        { name: "factory:implement", count: 1, byWorkspace: [{ workspaceId: shopId, workspaceName: "shop", count: 1 }] },
      ]);
      expect(dashboard.tools.map((tool) => [tool.name, tool.count])).toEqual([
        ["Bash", 3],
        ["mcp__Claude_Browser__computer", 1],
        ["mcp__Claude_Browser__navigate", 1],
      ]);
      expect(dashboard.mcpServers).toEqual([
        { name: "Claude_Browser", count: 2, byWorkspace: [{ workspaceId: shopId, workspaceName: "shop", count: 2 }] },
      ]);
      expect(dashboard.models.map((model) => [model.name, model.tokens.input + model.tokens.output])).toEqual([
        ["claude-opus-5-5", 1000],
        ["claude-haiku-5-5", 10],
      ]);
    });

    it("counts the sessions and tokens of every day of the period, in the given time zone", async () => {
      // Arrange
      const shop = buildWorkspace({ name: "shop" });
      // 23:30 UTC on the 16th is already the 17th in Paris.
      await ctx.seed.session(
        shop,
        buildSession({
          startedAt: new Date("2026-10-16T23:30:00.000Z"),
          endedAt: new Date("2026-10-17T00:30:00.000Z"),
          usages: [buildUsage({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 })],
        }),
      );
      await ctx.seed.session(shop, sessionOn("2026-10-17", { usages: [] }));

      // Act
      const paris = await getDashboard("?period=7d&timeZone=Europe%2FParis");
      const utc = await getDashboard("?period=7d");

      // Assert
      expect(paris.days).toEqual([
        { date: "2026-10-12", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-13", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-14", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-15", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-16", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-17", sessionCount: 2, tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } },
        { date: "2026-10-18", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { date: "2026-10-19", sessionCount: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
      ]);
      expect(utc.days.find((day) => day.date === "2026-10-16")?.sessionCount).toBe(1);
    });

    it("starts the all-time days at the first session's day, and has none without session", async () => {
      // Arrange
      await ctx.seed.session(buildWorkspace({ name: "shop" }), sessionOn("2026-10-17"));

      // Act
      const all = await getDashboard("?period=all");
      await ctx.reset();
      ctx.clock.set(NOW);
      const empty = await getDashboard("?period=all");

      // Assert
      expect(all.days.map((day) => day.date)).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"]);
      expect(empty.days).toEqual([]);
      expect(empty.totals.sessionCount).toBe(0);
    });

    it("returns 400 on an unknown period or time zone", async () => {
      // Act
      const period = await request(ctx.app).get("/v1/dashboard?period=1y");
      const timeZone = await request(ctx.app).get("/v1/dashboard?timeZone=Mars%2FOlympus");

      // Assert
      expect(period.status).toBe(400);
      expect((period.body as ProblemDetails).errors).toHaveProperty(["query.period"]);
      expect(timeZone.status).toBe(400);
      expect((timeZone.body as ProblemDetails).errors).toHaveProperty(["query.timeZone"]);
    });
  });
});
