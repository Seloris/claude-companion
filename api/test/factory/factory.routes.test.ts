import { mkdir, readdir, rm, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFactoryService } from "../../src/features/factory/factory.service.js";
import {
  factorySessionPlanResponseSchema,
  factoryStateSchema,
  type FactorySessionPlanResponse,
  type FactoryState,
} from "../../src/features/factory/factory.schema.js";
import { PLAN_MAX_BYTES } from "../../src/features/factory/factory.source.js";
import { buildSession, buildWorkspace } from "../factories.js";
import { createTestContext } from "../setup.js";
import {
  NOW,
  buildBoardExport,
  buildBoardExportV1,
  buildExportActivity,
  buildExportFeature,
  buildExportRun,
  buildExportSession,
  writeBoard,
  writePlan,
} from "./factory-builders.js";

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

  // One install of Claude Code's installed_plugins.json.
  const install = (overrides: Record<string, unknown>) => ({
    scope: "project",
    projectPath: "C:\\WS\\demo",
    installPath: "C:\\cache",
    version: "1.0.0",
    installedAt: "2026-10-01T00:00:00.000Z",
    lastUpdated: "2026-10-01T00:00:00.000Z",
    ...overrides,
  });
  const writePlugins = (plugins: Record<string, unknown[]>) =>
    writeFile(ctx.pluginsFile, JSON.stringify({ version: 2, plugins }), "utf8");

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
        phase: null,
        pendingCommit: null,
        recap: null,
      });
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0]?.boards).toEqual([
        {
          schemaVersion: 2,
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
          activity: { phase: "idle", sessionId: null, feature: null, step: null, since: null, pendingCommit: null, recap: null, isStored: false },
          sessions: [],
          plugins: { factory: null, factoryBoard: null },
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

  describe("the export versions", () => {
    const recap = { text: "Done.", commits: [{ sha: "abc1234", subject: "feat(demo): api" }] };

    it("serves a version 1 board with no activity, no sessions and no run phase (FR-04, BR-02)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExportV1({ live: [buildExportRun()] }));

      // Act
      const state = await getState();

      // Assert
      const board = state.workspaces[0]?.boards[0];
      expect(board).toMatchObject({ schemaVersion: 1, activity: null, sessions: [] });
      expect(board?.live[0]).toMatchObject({ phase: null, pendingCommit: null, recap: null });
    });

    it("serves the phase, the pending commit and the recap of every run as exported (BR-02, FR-24 to FR-26)", async () => {
      // Arrange
      const withPhase = (overrides: Parameters<typeof buildExportRun>[0] = {}) =>
        buildExportRun({ phase: "awaiting-commit", pendingCommit: "feat(demo): api", recap, ...overrides });
      const feature = buildExportFeature({
        autopilot: withPhase({ command: "autopilot" }),
        steps: [{ step: "stage:1", title: "Stage 1", detail: "", marker: "done", runs: [withPhase({ phase: "job-done" })] }],
      });
      await write("C--WS-demo.json", buildBoardExport({ live: [withPhase()], features: [feature] }));

      // Act
      const state = await getState();

      // Assert
      const board = state.workspaces[0]?.boards[0];
      const expected = { phase: "awaiting-commit", pendingCommit: "feat(demo): api", recap };
      expect(board?.live[0]).toMatchObject(expected);
      expect(board?.features[0]?.autopilot).toMatchObject(expected);
      expect(board?.features[0]?.steps[0]?.runs[0]).toMatchObject({ ...expected, phase: "job-done" });
    });

    it("serves a run without phase as phase null, whatever its status (BR-02)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ live: [buildExportRun({ status: "done" })] }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.live[0]).toMatchObject({ status: "done", phase: null });
    });

    it("serves the activity as exported, with since as ISO (FR-27)", async () => {
      // Arrange
      const activity = buildExportActivity({
        phase: "awaiting-commit",
        sessionId: "11111111-1111-4111-8111-111111111111",
        feature: "demo",
        step: "stage:1",
        since: NOW - 60_000,
        pendingCommit: "feat(demo): api",
        recap,
      });
      await write("C--WS-demo.json", buildBoardExport({ activity }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.activity).toEqual({ ...activity, since: iso(NOW - 60_000), isStored: false });
    });

    it("serves an idle activity with nulls and isStored false (FR-27)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ activity: buildExportActivity() }));

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.activity).toEqual({
        phase: "idle",
        sessionId: null,
        feature: null,
        step: null,
        since: null,
        pendingCommit: null,
        recap: null,
        isStored: false,
      });
    });

    it("serves the sessions in the exported order, each with its phase (FR-28)", async () => {
      // Arrange
      const sessions = [
        buildExportSession({ sessionId: "aaaaaaaa-1111-4111-8111-111111111111", phase: "awaiting-answer", recap }),
        buildExportSession({ sessionId: "bbbbbbbb-1111-4111-8111-111111111111", phase: "job-done" }),
        buildExportSession({ sessionId: "cccccccc-1111-4111-8111-111111111111", phase: "interrupted", status: "interrupted" }),
      ];
      await write("C--WS-demo.json", buildBoardExport({ sessions }));

      // Act
      const state = await getState();

      // Assert
      const served = state.workspaces[0]?.boards[0]?.sessions;
      expect(served?.map((session) => [session.sessionId.slice(0, 8), session.phase])).toEqual([
        ["aaaaaaaa", "awaiting-answer"],
        ["bbbbbbbb", "job-done"],
        ["cccccccc", "interrupted"],
      ]);
      expect(served?.[0]?.recap).toEqual(recap);
    });

    it("marks the sessions and the activity as stored when the history holds their session (FR-19)", async () => {
      // Arrange
      const known = buildSession();
      await ctx.seed.session(buildWorkspace({ path: "C:\\WS\\demo" }), known);
      const unknownId = "22222222-2222-4222-8222-222222222222";
      await write(
        "C--WS-demo.json",
        buildBoardExport({
          sessions: [buildExportSession({ sessionId: known.sessionId }), buildExportSession({ sessionId: unknownId })],
          activity: buildExportActivity({ phase: "job-done", sessionId: known.sessionId }),
        }),
      );
      await write(
        "C--WS-other.json",
        buildBoardExport({ root: "C:\\WS\\other", activity: buildExportActivity({ phase: "job-done", sessionId: unknownId }) }),
      );

      // Act
      const state = await getState();

      // Assert
      const boards = state.workspaces.flatMap((workspace) => workspace.boards);
      const demo = boards.find((board) => board.root === "C:\\WS\\demo");
      const other = boards.find((board) => board.root === "C:\\WS\\other");
      expect(demo?.sessions.map((session) => session.isStored)).toEqual([true, false]);
      expect(demo?.activity?.isStored).toBe(true);
      expect(other?.activity?.isStored).toBe(false);
    });

    it.each([
      ["an unknown run phase", { live: [{ ...buildExportRun(), phase: "sleeping" }] }],
      ["an unknown activity phase", { activity: { ...buildExportActivity(), phase: "sleeping" } }],
      ["no sessions", { sessions: undefined }],
      ["no activity", { activity: undefined }],
    ])("keeps the last board when a version 2 file holds %s (FR-21)", async (_name, broken) => {
      // Arrange
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await write("C--WS-demo.json", buildBoardExport({ branch: "feat/first" }));
      await getState();

      // Act
      await write("C--WS-demo.json", { ...buildBoardExport({ branch: "feat/second" }), ...broken });
      const state = await getState();

      // Assert
      expect(state.workspaces[0]?.boards[0]?.branch).toBe("feat/first");
    });
  });

  describe("the files", () => {
    it("lists a file of another version as unsupported and draws no board for it (FR-04)", async () => {
      // Arrange
      await write("v3.json", { ...buildBoardExport(), schemaVersion: 3 });
      await write("none.json", { root: "C:\\WS\\x" });
      await write("array.json", []);

      // Act
      const state = await getState();

      // Assert
      expect(state.workspaces).toEqual([]);
      expect(state.unsupportedFiles).toEqual([
        { fileName: "array.json", schemaVersion: null },
        { fileName: "none.json", schemaVersion: null },
        { fileName: "v3.json", schemaVersion: 3 },
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
      await write("b.json", { ...buildBoardExport(), schemaVersion: 3 });
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

  describe("the plugin versions", () => {
    async function boardPlugins() {
      const state = await getState();
      return state.workspaces[0]?.boards[0]?.plugins;
    }

    it("serves the versions installed for the board's project", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport());
      await writePlugins({
        "factory@webapp-factory": [
          install({ projectPath: "C:\\WS\\other", version: "0.6.0" }),
          install({ projectPath: "c:/ws/demo/", version: "0.7.0" }),
        ],
        "factory-board@webapp-factory": [install({ version: "0.11.0" })],
      });

      // Act
      const plugins = await boardPlugins();

      // Assert
      expect(plugins).toEqual({ factory: "0.7.0", factoryBoard: "0.11.0" });
    });

    it("falls back to the user scope, the latest update first", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport());
      await writePlugins({
        "factory@webapp-factory": [
          install({ scope: "user", projectPath: undefined, version: "0.5.0" }),
          install({ scope: "user", projectPath: undefined, version: "0.6.0", lastUpdated: "2026-10-02T00:00:00.000Z" }),
        ],
        "factory-board@webapp-factory": [install({ projectPath: "C:\\WS\\other" })],
      });

      // Act
      const plugins = await boardPlugins();

      // Assert
      expect(plugins).toEqual({ factory: "0.6.0", factoryBoard: null });
    });

    it("serves no version when the plugins file is missing or invalid", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport());

      // Act
      const missing = await boardPlugins();
      await writeFile(ctx.pluginsFile, "{ not json", "utf8");
      const invalid = await boardPlugins();

      // Assert
      expect(missing).toEqual({ factory: null, factoryBoard: null });
      expect(invalid).toEqual({ factory: null, factoryBoard: null });
    });
  });

  describe("GET /v1/factory/plugins", () => {
    async function getPlugins(): Promise<unknown> {
      const response = await request(ctx.app).get("/v1/factory/plugins").expect(200);
      return response.body;
    }

    it("serves the latest install of each plugin across projects and scopes", async () => {
      // Arrange
      await writePlugins({
        "factory@webapp-factory": [
          install({ projectPath: "C:\\WS\\a", version: "0.7.0", lastUpdated: "2026-10-05T00:00:00.000Z" }),
          install({ projectPath: "C:\\WS\\b", version: "0.8.0", lastUpdated: "2026-10-20T00:00:00.000Z" }),
          install({ scope: "user", projectPath: undefined, version: "0.6.0", lastUpdated: "2026-09-01T00:00:00.000Z" }),
        ],
        "factory-board@webapp-factory": [install({ scope: "user", projectPath: undefined, version: "0.11.0" })],
      });

      // Act
      const plugins = await getPlugins();

      // Assert
      expect(plugins).toEqual({ factory: "0.8.0", factoryBoard: "0.11.0" });
    });

    it("orders an install without lastUpdated by its installedAt", async () => {
      // Arrange
      await writePlugins({
        "factory@webapp-factory": [
          install({ version: "0.7.0", installedAt: "2026-10-01T00:00:00.000Z", lastUpdated: "2026-10-10T00:00:00.000Z" }),
          install({ version: "0.8.0", installedAt: "2026-10-15T00:00:00.000Z", lastUpdated: undefined }),
        ],
      });

      // Act
      const plugins = await getPlugins();

      // Assert
      expect(plugins).toEqual({ factory: "0.8.0", factoryBoard: null });
    });

    it("serves null for a plugin with no install and ignores the other plugins", async () => {
      // Arrange
      await writePlugins({
        "other@market": [install({ version: "9.9.9", lastUpdated: "2026-10-30T00:00:00.000Z" })],
        "factory@webapp-factory": [install({ version: "0.8.0" })],
      });

      // Act
      const plugins = await getPlugins();

      // Assert
      expect(plugins).toEqual({ factory: "0.8.0", factoryBoard: null });
    });

    it("serves null for both when the plugins file is missing or invalid", async () => {
      // Act
      const missing = await getPlugins();
      await writeFile(ctx.pluginsFile, "{ not json", "utf8");
      const invalid = await getPlugins();

      // Assert
      expect(missing).toEqual({ factory: null, factoryBoard: null });
      expect(invalid).toEqual({ factory: null, factoryBoard: null });
    });

    it("serves a new version as soon as the file changes", async () => {
      // Arrange
      await writePlugins({ "factory@webapp-factory": [install({ version: "0.7.0" })] });
      const before = await getPlugins();

      // Act
      await writePlugins({
        "factory@webapp-factory": [
          install({ version: "0.7.0" }),
          install({ version: "0.8.0", lastUpdated: "2026-10-21T00:00:00.000Z" }),
        ],
      });
      const after = await getPlugins();

      // Assert
      expect(before).toEqual({ factory: "0.7.0", factoryBoard: null });
      expect(after).toEqual({ factory: "0.8.0", factoryBoard: null });
    });
  });

  describe("the plan of a session", () => {
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const folder = ".planning/features/demo/dev-plans/20261021-000000-add-demo";
    const other = ".planning/features/demo/dev-plans/20261020-000000-fix-demo";
    let projects = "";
    let root = "";

    beforeEach(async () => {
      projects = path.join(ctx.tempRoot, "project-roots");
      root = path.join(projects, "checkout");
      await mkdir(root, { recursive: true });
    });

    afterEach(async () => {
      await rm(projects, { recursive: true, force: true });
    });

    async function getPlan(): Promise<FactorySessionPlanResponse> {
      const response = await request(ctx.app).get(`/v1/factory/sessions/${sessionId}/plan`).expect(200);
      return factorySessionPlanResponseSchema.parse(response.body);
    }

    const run = (overrides: Parameters<typeof buildExportRun>[0] = {}) => buildExportRun({ sessionId, folder, ...overrides });
    const session = (overrides: Parameters<typeof buildExportSession>[0] = {}) =>
      buildExportSession({ sessionId, folder, ...overrides });
    const stepRuns = (...runs: ReturnType<typeof buildExportRun>[]) =>
      buildExportFeature({ steps: [{ step: "stage:1", title: "Stage 1", detail: "", marker: "running", runs }] });

    it("returns no plan when no board names the session (FR-37)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run({ sessionId: "44444444-4444-4444-8444-444444444444" })] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body).toEqual({ plan: null });
    });

    it("returns no plan when the session's runs name no plan folder (FR-37)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run({ command: "write-spec", step: "spec", folder: null })] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body).toEqual({ plan: null });
    });

    it("reads the plan.md of the live run's folder under its board's root (FR-32, FR-34, FR-35)", async () => {
      // Arrange
      const content = "# Demo: a plan\n\n## Context\n\n- [ ] a step\n";
      await writePlan(root, folder, content);
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body).toEqual({
        plan: { folder, root, path: path.resolve(root, folder, "plan.md"), title: "Demo: a plan", content },
      });
    });

    it("prefers a live run over a session entry and a timeline run naming another folder (FR-33)", async () => {
      // Arrange
      await writePlan(root, folder, "# Live");
      await writePlan(root, other, "# Other");
      await write(
        "C--WS-demo.json",
        buildBoardExport({
          root,
          live: [run({ updatedAt: NOW - 60_000 })],
          sessions: [session({ folder: other, updatedAt: NOW - 1_000 })],
          features: [stepRuns(run({ folder: other, updatedAt: NOW - 1_000 }))],
        }),
      );

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan?.title).toBe("Live");
    });

    it("prefers the main loop's live run over a subagent's, then the latest change (FR-33)", async () => {
      // Arrange
      const older = ".planning/features/demo/dev-plans/20261019-000000-add-older";
      await writePlan(root, folder, "# Main, latest");
      await writePlan(root, other, "# Subagent");
      await writePlan(root, older, "# Main, older");
      await write(
        "C--WS-demo.json",
        buildBoardExport({
          root,
          live: [
            run({ folder: older, updatedAt: NOW - 50_000 }),
            run({ folder: other, agentId: "agent-1", updatedAt: NOW - 1_000 }),
            run({ updatedAt: NOW - 20_000 }),
          ],
        }),
      );

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan?.title).toBe("Main, latest");
    });

    it("uses the latest session entry when no live run names a folder (FR-33)", async () => {
      // Arrange
      await writePlan(root, folder, "# Latest entry");
      await writePlan(root, other, "# Older entry");
      await write(
        "C--WS-demo.json",
        buildBoardExport({
          root,
          live: [run({ folder: null })],
          sessions: [session({ folder: other, updatedAt: NOW - 50_000 }), session({ updatedAt: NOW - 10_000 })],
          features: [stepRuns(run({ folder: other, updatedAt: NOW - 1_000 }))],
        }),
      );

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan?.title).toBe("Latest entry");
    });

    it("uses a step's run, or the autopilot, when neither a live run nor a session entry names a folder (FR-33)", async () => {
      // Arrange
      await writePlan(root, folder, "# Step run");
      await writePlan(root, other, "# Autopilot");
      await write("C--WS-step.json", buildBoardExport({ root, features: [stepRuns(run({ agentId: "agent-1" }))] }));
      const fromStep = await getPlan();
      await rm(path.join(ctx.boardsDir, "C--WS-step.json"));
      await write(
        "C--WS-autopilot.json",
        buildBoardExport({ root, features: [buildExportFeature({ autopilot: run({ folder: other, command: "autopilot" }) })] }),
      );

      // Act
      const fromAutopilot = await getPlan();

      // Assert
      expect(fromStep.plan?.title).toBe("Step run");
      expect(fromAutopilot.plan?.title).toBe("Autopilot");
    });

    it("skips an off-workflow live run with no folder and uses the session entry that names a plan (FR-33)", async () => {
      // Arrange
      await writePlan(root, folder, "# The plan");
      await write(
        "C--WS-demo.json",
        buildBoardExport({
          root,
          live: [run({ command: "off-workflow", feature: null, folder: null, updatedAt: NOW - 1_000 })],
          sessions: [session({ updatedAt: NOW - 60_000 })],
        }),
      );

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan?.title).toBe("The plan");
    });

    it("reads the plan under the root of the run's own board when a checkout and its worktree hold the same folder (FR-35)", async () => {
      // Arrange
      const worktree = path.join(projects, "worktree");
      await writePlan(root, folder, "# Checkout");
      await writePlan(worktree, folder, "# Worktree");
      await write("C--WS-checkout.json", buildBoardExport({ root, live: [run({ sessionId: "55555555-5555-4555-8555-555555555555" })] }));
      await write("C--WS-worktree.json", buildBoardExport({ root: worktree, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan).toMatchObject({ root: worktree, path: path.resolve(worktree, folder, "plan.md"), title: "Worktree" });
    });

    it("includes a stale board and ignores a board file of an unsupported version (FR-33)", async () => {
      // Arrange
      await writePlan(root, folder, "# Stale");
      await writePlan(root, other, "# Unsupported");
      await write("C--WS-stale.json", buildBoardExport({ root, scannedAt: NOW - 3_600_000, live: [run()] }));
      await write("C--WS-future.json", { ...buildBoardExport({ root, live: [run({ folder: other, updatedAt: NOW })] }), schemaVersion: 3 });

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan?.title).toBe("Stale");
    });

    it("returns the new content after the file changed between two requests (FR-35)", async () => {
      // Arrange
      await writePlan(root, folder, "# First");
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run()] }));
      const first = await getPlan();
      await writePlan(root, folder, "# Second, longer");

      // Act
      const second = await getPlan();

      // Assert
      expect(first.plan?.content).toBe("# First");
      expect(second.plan).toMatchObject({ title: "Second, longer", content: "# Second, longer" });
    });

    it("returns no content and no title, with the path looked for, when the file is missing (FR-36)", async () => {
      // Arrange
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body).toEqual({ plan: { folder, root, path: path.resolve(root, folder, "plan.md"), title: null, content: null } });
    });

    it("reads no file outside the root, through a relative or an absolute folder (BR-06)", async () => {
      // Arrange
      const outside = path.join(projects, "outside");
      await writePlan(outside, "", "# Outside");
      await write("C--WS-relative.json", buildBoardExport({ root, live: [run({ folder: "../outside" })] }));
      const relative = await getPlan();
      await rm(path.join(ctx.boardsDir, "C--WS-relative.json"));
      await write("C--WS-absolute.json", buildBoardExport({ root, live: [run({ folder: outside })] }));

      // Act
      const absolute = await getPlan();

      // Assert
      expect(relative.plan).toMatchObject({ path: path.resolve(outside, "plan.md"), title: null, content: null });
      expect(absolute.plan).toMatchObject({ path: path.resolve(outside, "plan.md"), title: null, content: null });
    });

    it("reads no plan.md of the root itself for a folder that is the root (BR-05)", async () => {
      // Arrange
      await writePlan(root, "", "# Root");
      await write("C--WS-dot.json", buildBoardExport({ root, live: [run({ folder: "." })] }));
      const dot = await getPlan();
      await rm(path.join(ctx.boardsDir, "C--WS-dot.json"));
      await write("C--WS-slash.json", buildBoardExport({ root, live: [run({ folder: "./" })] }));

      // Act
      const slash = await getPlan();

      // Assert
      expect(dot.plan).toMatchObject({ title: null, content: null });
      expect(slash.plan).toMatchObject({ title: null, content: null });
    });

    it("returns no plan for a folder that is empty after trimming, as for no folder (BR-05, FR-37)", async () => {
      // Arrange
      await writePlan(root, "", "# Root");
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run({ folder: "" })], sessions: [session({ folder: "  " })] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body).toEqual({ plan: null });
    });

    it("reads and serves the folder trimmed, as the pick saw it (FR-33, FR-35)", async () => {
      // Arrange
      await writePlan(root, folder, "# Trimmed");
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run({ folder: `  ${folder}	` })] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan).toMatchObject({ folder, path: path.resolve(root, folder, "plan.md"), title: "Trimmed" });
    });

    it("reads no other file of the root through a plan.md linked to it (BR-05)", async (context) => {
      // Arrange
      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(path.join(root, ".env"), "SECRET=1");
      try {
        await symlink(path.join(root, ".env"), path.join(root, folder, "plan.md"), "file");
      } catch {
        context.skip("file symlinks need rights this machine does not grant");
      }
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan).toMatchObject({ path: path.resolve(root, folder, "plan.md"), title: null, content: null });
    });

    it("returns no content for a file larger than the size cap (FR-36)", async () => {
      // Arrange
      await writePlan(root, folder, `# Big\n${"x".repeat(PLAN_MAX_BYTES)}`);
      await write("C--WS-demo.json", buildBoardExport({ root, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan).toMatchObject({ title: null, content: null });
    });

    it("returns no title without a level-1 heading, and ignores a heading inside a fenced code block (FR-34)", async () => {
      // Arrange
      await writePlan(root, folder, "## Only a level 2\n\ntext\n");
      await writePlan(root, other, "```md\n# In a fence\n```\n\n~~~\n# In a tilde fence\n~~~\n\n# The title #\n");
      await write("C--WS-none.json", buildBoardExport({ root, live: [run()] }));
      const untitled = await getPlan();
      await rm(path.join(ctx.boardsDir, "C--WS-none.json"));
      await write("C--WS-fenced.json", buildBoardExport({ root, live: [run({ folder: other })] }));

      // Act
      const fenced = await getPlan();

      // Assert
      expect(untitled.plan).toMatchObject({ title: null, content: "## Only a level 2\n\ntext\n" });
      expect(fenced.plan?.title).toBe("The title");
    });

    it("keeps a heading's last # after a word, skips a longer fence holding a shorter one, and ignores a BOM (FR-34)", async () => {
      // Arrange
      const third = ".planning/features/demo/dev-plans/20261019-000000-add-bom";
      await writePlan(root, folder, "# Port to C#\n");
      await writePlan(root, other, "````md\n```\n# Inside\n```\n````\n\n```\n```js\n# Still inside\n```\n\n# Real\n");
      await writePlan(root, third, "\uFEFF# Bom title\n");
      const titleOf = async (name: string, runFolder: string) => {
        await write(name, buildBoardExport({ root, live: [run({ folder: runFolder })] }));
        const body = await getPlan();
        await rm(path.join(ctx.boardsDir, name));
        return body.plan?.title;
      };

      // Act
      const hash = await titleOf("C--WS-hash.json", folder);
      const fences = await titleOf("C--WS-fences.json", other);
      const bom = await titleOf("C--WS-bom.json", third);

      // Assert
      expect(hash).toBe("Port to C#");
      expect(fences).toBe("Real");
      expect(bom).toBe("Bom title");
    });

    it("reads no file for a board whose root is not absolute (BR-06)", async () => {
      // Arrange: a relative root that leads, from the API's own folder, to a real plan.
      await writePlan(root, folder, "# Relative");
      const relativeRoot = path.relative(process.cwd(), root);
      await write("C--WS-demo.json", buildBoardExport({ root: relativeRoot, live: [run()] }));

      // Act
      const body = await getPlan();

      // Assert
      expect(body.plan).toMatchObject({ root: relativeRoot, title: null, content: null });
    });

    it("answers 400 for a session id that is not a session id", async () => {
      // Act
      const response = await request(ctx.app).get("/v1/factory/sessions/a%20b/plan");

      // Assert
      expect(response.status).toBe(400);
      expect(response.headers["content-type"]).toMatch(/application\/problem\+json/);
    });
  });
});
