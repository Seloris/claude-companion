import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "../../src/features/health/health.schema.js";
import { createTestContext } from "../setup.js";

describe("GET /health", () => {
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

  it("returns ok with the current time", async () => {
    // Arrange
    ctx.clock.set("2026-10-17T12:00:00.000Z");

    // Act
    const res = await request(ctx.app).get("/health");

    // Assert
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: "ok", time: "2026-10-17T12:00:00.000Z" });
  });
});
