import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ExportActivity,
  ExportSession,
  FactoryExportV1,
  FactoryExportV2,
} from "../../src/features/factory/factory.source.js";

// Valid objects shaped like the mod's own export (its types/index.d.ts): never copies of real files.
type ExportFeature = FactoryExportV2["features"][number];
type ExportRun = FactoryExportV2["live"][number];

// The test clock starts here; boards are scanned relative to it.
export const NOW = Date.parse("2026-01-01T00:00:00.000Z");

export function buildExportRun(overrides: Partial<ExportRun> = {}): ExportRun {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    feature: "demo",
    folder: null,
    command: "implement",
    step: "stage:1",
    status: "running",
    since: NOW - 120_000,
    updatedAt: NOW - 30_000,
    ...overrides,
  };
}

export function buildExportFeature(overrides: Partial<ExportFeature> = {}): ExportFeature {
  return {
    slug: "demo",
    title: "Demo feature",
    state: "running",
    isNewPlan: false,
    hasSpec: true,
    specStatus: "Approved",
    plan: null,
    plans: [],
    autopilot: null,
    next: null,
    steps: [],
    ...overrides,
  };
}

export function buildExportSession(overrides: Partial<ExportSession> = {}): ExportSession {
  return { ...buildExportRun(), phase: "job-done", ...overrides };
}

export function buildExportActivity(overrides: Partial<ExportActivity> = {}): ExportActivity {
  return { phase: "idle", sessionId: null, feature: null, step: null, since: null, pendingCommit: null, recap: null, ...overrides };
}

export function buildBoardExport(overrides: Partial<FactoryExportV2> = {}): FactoryExportV2 {
  return { ...buildBoardExportV1(), schemaVersion: 2, activity: buildExportActivity(), sessions: [], ...overrides };
}

export function buildBoardExportV1(overrides: Partial<FactoryExportV1> = {}): FactoryExportV1 {
  return {
    schemaVersion: 1,
    scannedAt: NOW - 5_000,
    root: "C:\\WS\\demo",
    repo: null,
    branch: "feat/demo",
    baseBranch: "develop",
    aheadCount: 2,
    changedCount: 3,
    models: {},
    error: null,
    markers: { review: " — with review", browser: " — with browser test" },
    squash: null,
    live: [],
    features: [],
    ...overrides,
  };
}

// A string is written as is: the way to write a file the mod is half way through rewriting.
export async function writeBoard(boardsDir: string, fileName: string, value: unknown): Promise<string> {
  const target = path.join(boardsDir, fileName);
  await writeFile(target, typeof value === "string" ? value : JSON.stringify(value));
  return target;
}

// A plan.md in a plan folder of a project root, the folder relative to the root as the mod exports it.
export async function writePlan(root: string, folder: string, content: string): Promise<string> {
  const target = path.join(root, folder, "plan.md");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}
