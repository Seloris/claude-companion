import { mkdir, utimes } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logRetentionStatusSchema } from "../../src/features/retention/retention.schema.js";
import { userLine, writeSession } from "../ingestion/log-builders.js";
import { createTestContext } from "../setup.js";

describe("retention routes", () => {
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

  describe("GET /v1/retention", () => {
    it("returns the default retention for an empty logs folder", async () => {
      // Arrange
      await mkdir(ctx.logsDir, { recursive: true });

      // Act
      const res = await request(ctx.app).get("/v1/retention");

      // Assert
      expect(res.status).toBe(200);
      expect(logRetentionStatusSchema.parse(res.body)).toEqual({
        retentionDays: 30,
        isDefault: true,
        oldestLogAt: null,
        archivedSessionCount: 0,
        unreadAtRisk: { fileCount: 0, nearestDeletionAt: null },
      });
    });

    it("returns the unread file at risk", async () => {
      // Arrange
      const { mainFile } = await writeSession(ctx.logsDir, "C--WS-demo", { lines: [userLine("Go")] });
      const modifiedAt = new Date("2025-12-07T00:00:00.000Z");
      await utimes(mainFile, modifiedAt, modifiedAt);

      // Act
      const res = await request(ctx.app).get("/v1/retention");

      // Assert
      expect(res.status).toBe(200);
      expect(logRetentionStatusSchema.parse(res.body)).toEqual({
        retentionDays: 30,
        isDefault: true,
        oldestLogAt: "2025-12-07T00:00:00.000Z",
        archivedSessionCount: 0,
        unreadAtRisk: { fileCount: 1, nearestDeletionAt: "2026-01-06T00:00:00.000Z" },
      });
    });
  });
});
