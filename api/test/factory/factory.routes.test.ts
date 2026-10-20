import { readdir, rm, stat, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFactoryService } from "../../src/features/factory/factory.service.js";
import { factoryStateSchema, type FactoryState } from "../../src/features/factory/factory.schema.js";
import { buildSession, buildWorkspace } from "../factories.js";
import { createTestContext } from "../setup.js";
import { NOW, buildBoardExport, buildExportFeature, buildExportRun, writeBoard } from "./factory-builders.js";

const iso = (ms: number) => new Date(ms).toISOString();

describe("factory routes", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let touched = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  beforeEach(async () => {
    await ctx.reset();
    ctx.clock.set(iso(NOW));
    touched = 0;
    vi.restoreAllMocks();
  });

  async function getState(): Promise<FactoryState> {
    const response = await request(ctx.app).get("/v1/factory").expect(200);
    return factoryStateSchema.parse(response.body);
  }

  // A write the service sees as a change even when the size stays the same: the modification time moves on.
  async function write(fileName: string, value: unknown) {
    const target = await writeBoard(ctx.boardsDir, fileName, value);
    touched += 1;
    const date = new Date(NOW + touched * 1000);
    await utimes(target, date, date);
  }

  describe("the boards folder", () => {
    it("says the folder is not readable when it is missing (FR-06)", async () => {
      // Arrange
      await rm(ctx.boardsDir, { recursive: true });

      // Act
      const state = await getState();

      // Assert
      expect(state).toMatchObject({ isBoardsDirReadable: false, boardsDir: ctx.boardsDir, workspaces: [], unsupportedFiles: [] });
    });

    it("says the folder is readable and holds no board when it is empty (FR-06)", async () => {
      // Act
      const state = await getState();

      // Assert
      expect(state).toMatchObject({ isBoardsDirReadable: true, boardsDir: ctx.boardsDir, workspaces: [], unsupportedFiles: [] });
      expect(state.readAt).toBe(iso(NOW));
    });

    it("ignores a file that is not a .json", async () => {
      // Arrange
      await write("notes.txt", buildBoardExport());
      await write("board.json.bak", buildBoardExport());

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
      expect(state.unsupportedFiles).toEqual([]);
    });
  });

  describe("a board", () => {
    it("serves the branch line, the markers and the features as exported, with ISO dates (BR-02)", async () => {
      // Arrange
      const autopilot = buildExportRun({ command: "autopilot", step: "plan" });
      const stageRun = buildExportRun({ lastStep: "stage:2", agentId: "agent-1", status: "done" });
      const feature = buildExportFeature({
        slug: "demo",
        state: "review",
        plan: {
          folder: ".planning/features/demo/dev-plans/20261020-181133-init-demo",
          title: "Demo plan",
          stages: [{ number: 1, title: "api", commit: "feat(demo): api", sha: "abc1234", done: 2, total: 2 }],
          validationDone: 1,
          validationTotal: 3,
          reviewDone: false,
          isDraft: false,
        },
        plans: [".planning/features/demo/dev-plans/20261020-181133-init-demo"],
        autopilot,
        next: { label: "Stage 2", prompt: "/factory:implement x — stage 2 (web)", all: { label: "All", prompt: "/factory:implement x — stages 2-3, chained" }, autopilot: { label: "Auto", prompt: "/factory:autopilot x" } },
        steps: [{ step: "stage:1", title: "Stage 1 — api", detail: "abc1234", marker: "done", runs: [stageRun] }],
      });
      await write("C--WS-demo.json", buildBoardExport({ scannedAt: NOW - 5_000, live: [autopilot], features: [feature] }));

      // Act
      const state = await getState();

      // Assert
      const servedRun = (run: ReturnType<typeof buildExportRun>) => ({
        sessionId: run.sessionId,
        feature: run.feature,
        folder: run.folder,
        command: run.command,
        step: run.step,
        lastStep: run.lastStep ?? null,
        agentId: run.agentId ?? null,
        status: run.status,
        since: iso(run.since),
        updatedAt: iso(run.updatedAt),
        isStored: false,
      });
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0]?.boards).toEqual([
        {
          fileName: "C--WS-demo.json",
          root: "C:\\WS\\demo",
          branch: "feat/demo",
          baseBranch: "develop",
          aheadCount: 2,
          changedCount: 3,
          scannedAt: iso(NOW - 5_000),
          isStale: false,
          error: null,
          markers: { review: " — with review", browser: " — with browser test" },
          live: [servedRun(autopilot)],
          features: [
            {
              slug: "demo",
              title: "Demo feature",
              state: "review",
              isNewPlan: false,
              hasSpec: true,
              specStatus: "Approved",
              plan: feature.plan,
              plans: feature.plans,
              autopilot: servedRun(autopilot),
              next: {
                label: "Stage 2",
                prompt: "/factory:implement x — stage 2 (web)",
                all: { label: "All", prompt: "/factory:implement x — stages 2-3, chained" },
                autopilot: { label: "Auto", prompt: "/factory:autopilot x" },
              },
              steps: [{ step: "stage:1", title: "Stage 1 — api", detail: "abc1234", marker: "done", runs: [servedRun(stageRun)] }],
            },
          ],
        },
      ]);
    });

    it("serves the absent all and autopilot prompts of next as null (BR-02)", async () => {
      // Arrange
      const feature = buildExportFeature({ next: { label: "Stage 1", prompt: "/factory:implement x � stage 1 (api)" } });
      await write("C--WS-demo.json", buildBoardExport({ features: [feature] }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.features[0]?.next).toEqual({
        label: "Stage 1",
        prompt: "/factory:implement x � stage 1 (api)",
        all: null,
        autopilot: null,
      });
    });

    it("serves the error of a board with its features as exported (FR-05)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ error: "No .planning/features", features: [buildExportFeature({ slug: "kept" })] }));

      // Act
      const state = await getState();

      // Assert
      const board = state.workspaces[0]?.boards[0];
      expect(board?.error).toBe("No .planning/features");
      expect(board?.features.map((feature) => feature.slug)).toEqual(["kept"]);
    });

    it("marks a board stale only when scanned more than 60 seconds ago (FR-11)", async () => {
      // Arrange
      await write("exact.json", buildBoardExport({ root: "C:\\WS\\exact", scannedAt: NOW - 60_000 }));
      await write("late.json", buildBoardExport({ root: "C:\\WS\\late", scannedAt: NOW - 60_001 }));

      // Act
      const state = await getState();

      // Assert
      const stale = (name: string) => state.workspaces.find((workspace) => workspace.name === name)?.boards[0]?.isStale;
      expect(stale("exact")).toBe(false);
      expect(stale("late")).toBe(true);
    });
  });

  describe("the files", () => {
    it("lists a file of another version as unsupported and draws no board for it (FR-04)", async () => {
      // Arrange
      await write("v2.json", { ...buildBoardExport(), schemaVersion: 2 });
      await write("none.json", { root: "C:\\WS\\x" });
      await write("array.json", []);

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
      expect(state.unsupportedFiles).toEqual([
        { fileName: "array.json", schemaVersion: null },
        { fileName: "none.json", schemaVersion: null },
        { fileName: "v2.json", schemaVersion: 2 },
      ]);
    });

    it("keeps the last board when the file is rewritten unparsable, then serves the next valid rewrite (FR-21)", async () => {
      // Arrange
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await write("C--WS-demo.json", buildBoardExport({ branch: "feat/first" }));
      await getState();

      // Act
      await write("C--WS-demo.json", '{"schemaVersion":1,"scannedAt":');
      const whileBroken = await getState();
      const again = await getState();
      await write("C--WS-demo.json", buildBoardExport({ branch: "feat/second", scannedAt: NOW - 1_000 }));
      const recovered = await getState();

      // Assert
      expect(whileBroken.workspaces[0]?.boards[0]?.branch).toBe("feat/first");
      expect(again.workspaces[0]?.boards[0]?.branch).toBe("feat/first");
      expect(whileBroken.unsupportedFiles).toEqual([]);
      expect(recovered.workspaces[0]?.boards[0]?.branch).toBe("feat/second");
      expect(log).toHaveBeenCalledTimes(1);
    });

    it("keeps the last board when a version 1 file no longer fits the schema (FR-21)", async () => {
      // Arrange
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await write("C--WS-demo.json", buildBoardExport({ branch: "feat/first" }));
      await getState();

      // Act
      await write("C--WS-demo.json", { ...buildBoardExport(), features: "nope" });
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.branch).toBe("feat/first");
    });

    it("draws no board, and shows no error, for a file unparsable from the start (FR-21)", async () => {
      // Arrange
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await write("C--WS-demo.json", "{ not json");

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
      expect(state.unsupportedFiles).toEqual([]);
    });

    it("replaces a cached board when its file becomes a version it does not support (FR-04)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport());
      await getState();

      // Act
      await write("C--WS-demo.json", { ...buildBoardExport(), schemaVersion: 3 });
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
      expect(state.unsupportedFiles).toEqual([{ fileName: "C--WS-demo.json", schemaVersion: 3 }]);
    });

    it("removes the board of a deleted file (FR-22)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport());
      expect((await getState()).workspaces).toHaveLength(1);

      // Act
      await unlink(path.join(ctx.boardsDir, "C--WS-demo.json"));
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
    });

    it("leaves the boards folder unchanged after reads (BR-01)", async () => {
      // Arrange
      await write("a.json", buildBoardExport({ root: "C:\\WS\\a" }));
      await write("b.json", { ...buildBoardExport(), schemaVersion: 2 });
      await write("c.json", "{ broken");
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const snapshot = async () =>
        Promise.all(
          (await readdir(ctx.boardsDir)).sort().map(async (name) => {
            const { size, mtimeMs } = await stat(path.join(ctx.boardsDir, name));
            return { name, size, mtimeMs };
          }),
        );
      const before = await snapshot();

      // Act
      await getState();
      await getState();

      // Assert
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("the workspace of a board", () => {
    it("carries the stored workspace's id and name when the root matches it (FR-02)", async () => {
      // Arrange
      await ctx.seed.session(buildWorkspace({ name: "stored", path: "C:\\WS\\stored" }), buildSession());
      await write("stored.json", buildBoardExport({ root: "C:\\WS\\stored" }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0]).toMatchObject({ workspaceId: expect.any(Number), name: "stored", path: "C:\\WS\\stored", key: "c:/ws/stored" });
    });

    it("joins a worktree's board to its repository's workspace, beside the main checkout's (FR-02)", async () => {
      // Arrange
      await ctx.seed.session(buildWorkspace({ name: "repo", path: "C:\\WS\\repo" }), buildSession());
      await write("main.json", buildBoardExport({ root: "C:\\WS\\repo", scannedAt: NOW - 2_000 }));
      await write("tree.json", buildBoardExport({ root: "C:\\WS\\repo\\.claude\\worktrees\\wt", scannedAt: NOW - 1_000 }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0]?.name).toBe("repo");
      expect(state.workspaces[0]?.workspaceId).not.toBeNull();
      expect(state.workspaces[0]?.boards.map((board) => board.root)).toEqual(["C:\\WS\\repo\\.claude\\worktrees\\wt", "C:\\WS\\repo"]);
    });

    it("names an unknown root after its last folder, without a workspace id (FR-03)", async () => {
      // Arrange
      await write("unknown.json", buildBoardExport({ root: "C:\\WS\\unknown-project" }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]).toMatchObject({ workspaceId: null, name: "unknown-project", path: "C:\\WS\\unknown-project" });
    });
  });

  describe("the order and the counts", () => {
    it("lists a group with a live run on a fresh board first, then by most recent scan (FR-07)", async () => {
      // Arrange
      await write("recent.json", buildBoardExport({ root: "C:\\WS\\recent", scannedAt: NOW - 1_000 }));
      await write("older.json", buildBoardExport({ root: "C:\\WS\\older", scannedAt: NOW - 20_000 }));
      await write("live.json", buildBoardExport({ root: "C:\\WS\\live", scannedAt: NOW - 30_000, live: [buildExportRun()] }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces.map((workspace) => workspace.name)).toEqual(["live", "recent", "older"]);
      expect(state.workspaces[0]?.hasLiveRun).toBe(true);
    });

    it("does not count the live run of a stale board, and still lists a long-stale board (FR-07, FR-11)", async () => {
      // Arrange
      await write("stale.json", buildBoardExport({ root: "C:\\WS\\stale", scannedAt: NOW - 3_600_000, live: [buildExportRun()] }));
      await write("fresh.json", buildBoardExport({ root: "C:\\WS\\fresh", scannedAt: NOW - 10_000 }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces.map((workspace) => workspace.name)).toEqual(["fresh", "stale"]);
      const stale = state.workspaces[1];
      expect(stale?.hasLiveRun).toBe(false);
      expect(stale?.boards[0]).toMatchObject({ isStale: true });
      expect(stale?.boards[0]?.live).toHaveLength(1);
    });

    it("sums the running and review features of the group's boards, and follows the non-stale live runs (FR-09)", async () => {
      // Arrange
      await ctx.seed.session(buildWorkspace({ name: "repo", path: "C:\\WS\\repo" }), buildSession());
      await write(
        "main.json",
        buildBoardExport({
          root: "C:\\WS\\repo",
          features: [
            buildExportFeature({ slug: "a", state: "running" }),
            buildExportFeature({ slug: "b", state: "review" }),
            buildExportFeature({ slug: "c", state: "done" }),
          ],
        }),
      );
      await write(
        "tree.json",
        buildBoardExport({
          root: "C:\\WS\\repo\\.claude\\worktrees\\wt",
          scannedAt: NOW - 3_600_000,
          live: [buildExportRun()],
          features: [buildExportFeature({ slug: "a", state: "running" }), buildExportFeature({ slug: "d", state: "plan" })],
        }),
      );

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]).toMatchObject({ counts: { running: 2, review: 1 }, hasLiveRun: false });
    });
  });

  describe("the runs' sessions", () => {
    it("marks a run as stored when the history holds its session, in live, autopilot and step runs (FR-19)", async () => {
      // Arrange
      const known = buildSession();
      await ctx.seed.session(buildWorkspace({ path: "C:\\WS\\demo" }), known);
      const stored = (overrides: Parameters<typeof buildExportRun>[0] = {}) => buildExportRun({ sessionId: known.sessionId, ...overrides });
      const unknown = buildExportRun({ sessionId: "22222222-2222-4222-8222-222222222222" });
      const feature = buildExportFeature({
        autopilot: stored({ command: "autopilot" }),
        steps: [{ step: "stage:1", title: "Stage 1", detail: "", marker: "done", runs: [stored(), unknown] }],
      });
      await write("C--WS-demo.json", buildBoardExport({ live: [stored(), unknown], features: [feature] }));

      // Act
      const state = await getState();

      // Assert
      const board = state.workspaces[0]?.boards[0];
      expect(board?.live.map((run) => run.isStored)).toEqual([true, false]);
      expect(board?.features[0]?.autopilot?.isStored).toBe(true);
      expect(board?.features[0]?.steps[0]?.runs.map((run) => run.isStored)).toEqual([true, false]);
    });

    it("never looks up a session id that is not an id", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ live: [buildExportRun({ sessionId: "../escape; drop" }), buildExportRun()] }));
      const findStoredSessionIds = vi.fn<(ids: string[]) => Promise<Set<string>>>(async () => new Set());
      const service = createFactoryService({
        workspacesRepo: { findStoredSessionIds, findWorkspacesByPathKeys: async () => new Map() },
        clock: ctx.clock,
        boardsDir: ctx.boardsDir,
        scratchRoot: ctx.scratchRoot,
        findRepoRoot: () => null,
      });

      // Act
      await service.getFactoryState();

      // Assert
      expect(findStoredSessionIds).toHaveBeenCalledWith(["11111111-1111-4111-8111-111111111111"]);
    });
  });
});
