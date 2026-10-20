import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { healthResponseSchema } from "../../src/features/health/health.schema.js";
import { createTestContext } from "../setup.js";

type TestContext = Awaited<ReturnType<typeof createTestContext>>;

const INDEX_MARKER = "<title>front-marker</title>";

describe("web routes (started with a web folder)", () => {
  let ctx: TestContext;
  let webRoot: string;

  beforeAll(async () => {
    webRoot = await mkdtemp(path.join(os.tmpdir(), "claude-companion-web-"));
    await mkdir(path.join(webRoot, "assets"));
    await writeFile(path.join(webRoot, "index.html"), `<!doctype html>${INDEX_MARKER}`);
    await writeFile(path.join(webRoot, "assets", "app.js"), "console.log('app');");
    ctx = await createTestContext({ webDir: webRoot });
  });

  afterAll(async () => {
    await ctx.dispose();
    await rm(webRoot, { recursive: true, force: true });
  });

  it("serves index.html at the root", async () => {
    // Act
    const res = await request(ctx.app).get("/");

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain(INDEX_MARKER);
  });

  it("serves index.html for a front route", async () => {
    // Act
    const live = await request(ctx.app).get("/live");
    const workspace = await request(ctx.app).get("/workspaces/3");

    // Assert
    expect(live.status).toBe(200);
    expect(live.text).toContain(INDEX_MARKER);
    expect(workspace.status).toBe(200);
    expect(workspace.text).toContain(INDEX_MARKER);
  });

  it("serves a built asset with its content type", async () => {
    // Act
    const res = await request(ctx.app).get("/assets/app.js");

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.text).toContain("console.log('app');");
  });

  it("returns 404, not index.html, for a missing asset", async () => {
    // Act
    const res = await request(ctx.app).get("/assets/missing.js");

    // Assert
    expect(res.status).toBe(404);
    expect(res.text).not.toContain(INDEX_MARKER);
  });

  it("serves the API under /api", async () => {
    // Act
    const res = await request(ctx.app).get("/api/health");

    // Assert
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body).status).toBe("ok");
  });

  it("still serves the API at its root paths", async () => {
    // Act
    const res = await request(ctx.app).get("/health");

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(healthResponseSchema.parse(res.body).status).toBe("ok");
  });

  it("returns 404, not index.html, for an unknown /api path", async () => {
    // Act
    const res = await request(ctx.app).get("/api/v1/unknown");

    // Assert
    expect(res.status).toBe(404);
    expect(res.text).not.toContain(INDEX_MARKER);
  });

  it("returns 404, not index.html, for an unknown API path at the root", async () => {
    // Act
    const res = await request(ctx.app).get("/v1/unknown");

    // Assert
    expect(res.status).toBe(404);
    expect(res.text).not.toContain(INDEX_MARKER);
  });

  it("does not answer a POST to a front route with index.html", async () => {
    // Act
    const res = await request(ctx.app).post("/live");

    // Assert
    expect(res.status).toBe(404);
    expect(res.text).not.toContain(INDEX_MARKER);
  });
});

describe("web routes (started without a web folder)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  it("serves no front and no /api alias", async () => {
    // Act
    const root = await request(ctx.app).get("/");
    const alias = await request(ctx.app).get("/api/health");
    const health = await request(ctx.app).get("/health");

    // Assert
    expect(root.status).toBe(404);
    expect(alias.status).toBe(404);
    expect(health.status).toBe(200);
  });
});
