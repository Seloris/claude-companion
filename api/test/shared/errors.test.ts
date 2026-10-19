import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { problemDetailsSchema } from "../../src/shared/errors.js";
import { createTestContext } from "../setup.js";

describe("errorHandler", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  it("returns 400 problem details when the JSON body does not parse", async () => {
    // Arrange
    const body = '{"name": ';

    // Act
    const res = await request(ctx.app).post("/health").set("Content-Type", "application/json").send(body);

    // Assert
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(problemDetailsSchema.parse(res.body)).toMatchObject({ status: 400, code: "validation_failed" });
  });
});
