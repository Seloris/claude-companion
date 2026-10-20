import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshStatusSchema } from "../../src/features/ingestion/ingestion.schema.js";
import { refreshSchedules } from "../../src/features/ingestion/ingestion.table.js";
import { sessions } from "../../src/features/workspaces/workspaces.table.js";
import type { ProblemDetails } from "../../src/shared/errors.js";
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
    await ctx.dispose();
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

    it("starts a full refresh when asked, which its report says", async () => {
      // Arrange
      await writeSession(ctx.logsDir, "C--WS-demo", { lines: [userLine("Go")] });
      await ctx.ingestion.refresh();

      // Act
      const started = await request(ctx.app).post("/v1/refresh?mode=full");
      await ctx.ingestion.whenIdle();
      const status = await request(ctx.app).get("/v1/refresh");

      // Assert
      expect(started.status).toBe(202);
      expect(refreshStatusSchema.parse(status.body).lastReport).toMatchObject({
        mode: "full",
        sessionsRead: 1,
        sessionsUpdated: 1,
      });
    });

    it("returns 400 on an unknown mode", async () => {
      // Act
      const res = await request(ctx.app).post("/v1/refresh?mode=partial");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body as ProblemDetails).toMatchObject({ status: 400 });
      expect((await ctx.ingestion.getStatus()).isRunning).toBe(false);
    });
  });

  describe("GET /v1/refresh/schedule", () => {
    it("returns the default of 10 minutes when none was chosen", async () => {
      // Act
      const res = await request(ctx.app).get("/v1/refresh/schedule");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ intervalMinutes: 10 });
    });
  });

  describe("PUT /v1/refresh/schedule", () => {
    it("saves the interval, which the next read returns", async () => {
      // Act
      const put = await request(ctx.app).put("/v1/refresh/schedule").send({ intervalMinutes: 30 });
      const get = await request(ctx.app).get("/v1/refresh/schedule");

      // Assert
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ intervalMinutes: 30 });
      expect(get.body).toEqual({ intervalMinutes: 30 });
      expect(await ctx.db.select().from(refreshSchedules)).toMatchObject([{ id: 1, intervalMinutes: 30 }]);
      expect(ctx.timer.pending()).toEqual([30 * 60_000]);
    });

    it("turns the periodic refresh off with null", async () => {
      // Act
      const put = await request(ctx.app).put("/v1/refresh/schedule").send({ intervalMinutes: null });
      const get = await request(ctx.app).get("/v1/refresh/schedule");

      // Assert
      expect(put.status).toBe(200);
      expect(get.body).toEqual({ intervalMinutes: null });
      expect(await ctx.db.select().from(refreshSchedules)).toMatchObject([{ id: 1, intervalMinutes: null }]);
      expect(ctx.timer.pending()).toEqual([]);
    });

    it.each([
      ["an interval that is not offered", { intervalMinutes: 15 }],
      ["a string", { intervalMinutes: "30" }],
      ["a missing field", {}],
    ])("returns 400 on %s", async (_case, body) => {
      // Act
      const res = await request(ctx.app).put("/v1/refresh/schedule").send(body);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body as ProblemDetails).toMatchObject({ status: 400 });
      expect((await request(ctx.app).get("/v1/refresh/schedule")).body).toEqual({ intervalMinutes: 10 });
    });

    it("returns 400 on an empty body", async () => {
      // Act
      const res = await request(ctx.app).put("/v1/refresh/schedule");

      // Assert
      expect(res.status).toBe(400);
    });
  });
});
