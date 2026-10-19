import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshStatusSchema } from "../../src/features/ingestion/ingestion.schema.js";
import { sessions } from "../../src/features/workspaces/workspaces.table.js";
import { createTestContext } from "../setup.js";
import { userLine, writeSession } from "./log-builders.js";

describe("refresh routes", () => {
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

  describe("GET /v1/refresh", () => {
    it("returns no report before any refresh", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/refresh");

      // Assert
      expect(res.status).toBe(200);
      expect(refreshStatusSchema.parse(res.body)).toEqual({
        isRunning: false,
        startedAt: null,
        logsDir: ctx.logsDir,
        lastReport: null,
      });
    });
  });

  describe("POST /v1/refresh", () => {
    it("starts a refresh whose report the status then carries", async () => {
      // Arrange
      await writeSession(ctx.logsDir, "C--WS-demo", { lines: [userLine("Go")] });
      ctx.clock.set("2026-10-02T08:00:00.000Z");

      // Act
      const started = await request(ctx.app).post("/v1/refresh");
      await ctx.ingestion.whenIdle();
      const status = await request(ctx.app).get("/v1/refresh");

      // Assert
      expect(started.status).toBe(202);
      expect(refreshStatusSchema.parse(started.body)).toMatchObject({
        isRunning: true,
        startedAt: "2026-10-02T08:00:00.000Z",
      });
      expect(refreshStatusSchema.parse(status.body)).toMatchObject({
        isRunning: false,
        startedAt: null,
        lastReport: { status: "succeeded", isLogsDirFound: true, sessionsAdded: 1 },
      });
      expect(await ctx.db.select({ id: sessions.id }).from(sessions)).toHaveLength(1);
    });
  });
});
