import type { Clock } from "../../shared/clock.js";
import { resolveWorkspace, type ResolvedWorkspace } from "../ingestion/ingestion.workspace.js";
import type { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import type { FactoryBoard, FactoryFeature, FactoryRun, FactoryState, FactoryWorkspace } from "./factory.schema.js";
import { listBoardFiles, readBoardFile, type ExportRun, type FactoryExport } from "./factory.source.js";

// FR-11: a board scanned more than this long ago is frozen, no session of its project runs the mod.
export const STALE_AFTER_MS = 60_000;

const SESSION_ID = /^[\w-]+$/;

type CachedRead = { kind: "board"; board: FactoryExport } | { kind: "unsupported"; schemaVersion: number | null };

interface CacheEntry {
  mtimeMs: number;
  size: number;
  read: CachedRead;
}

export function createFactoryService({
  workspacesRepo,
  clock,
  boardsDir,
  scratchRoot,
  findRepoRoot,
}: {
  workspacesRepo: Pick<WorkspacesRepository, "findWorkspacesByPathKeys" | "findStoredSessionIds">;
  clock: Clock;
  boardsDir: string;
  scratchRoot: string;
  findRepoRoot: (cwd: string) => string | null;
}) {
  // In memory only (BR-01): nothing of the boards is stored. The last good read of each file, by file name.
  const cache = new Map<string, CacheEntry>();
  // One log per file until it reads again.
  const failedFiles = new Set<string>();

  async function refreshCache(): Promise<boolean> {
    const listing = await listBoardFiles(boardsDir);
    if (!listing.isDirReadable) {
      cache.clear();
      failedFiles.clear();
      return false;
    }
    const listed = new Set(listing.names);
    // FR-22: a file that disappeared takes its board with it.
    for (const fileName of [...cache.keys()]) if (!listed.has(fileName)) cache.delete(fileName);
    for (const fileName of [...failedFiles]) if (!listed.has(fileName)) failedFiles.delete(fileName);

    for (const file of listing.files) {
      const entry = cache.get(file.fileName);
      if (entry !== undefined && entry.mtimeMs === file.mtimeMs && entry.size === file.size) continue;
      const read = await readBoardFile(boardsDir, file.fileName);
      if (read.kind === "unreadable") {
        // FR-21: the last good board stays, with its old stat so the next request reads the file again.
        if (!failedFiles.has(file.fileName)) {
          failedFiles.add(file.fileName);
          console.error(`factory board ${file.fileName}: it could not be read, the last good board is kept`);
        }
        continue;
      }
      failedFiles.delete(file.fileName);
      cache.set(file.fileName, { mtimeMs: file.mtimeMs, size: file.size, read });
    }
    return true;
  }

  async function readFactoryState(): Promise<FactoryState> {
    const now = clock.now();
    const readAt = now.toISOString();
    if (!(await refreshCache())) {
      return { readAt, boardsDir, isBoardsDirReadable: false, unsupportedFiles: [], workspaces: [] };
    }

    const exported: { fileName: string; board: FactoryExport }[] = [];
    const unsupportedFiles: FactoryState["unsupportedFiles"] = [];
    for (const [fileName, { read }] of [...cache.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (read.kind === "board") exported.push({ fileName, board: read.board });
      else unsupportedFiles.push({ fileName, schemaVersion: read.schemaVersion });
    }

    // FR-02, FR-03: the board's workspace by the rules of a session, then the stored row by its path key.
    const resolved = exported.map(({ board }) => resolveWorkspace(board.root, { scratchRoot, findRepoRoot }));
    const stored = await workspacesRepo.findWorkspacesByPathKeys([...new Set(resolved.map((workspace) => workspace.pathKey))]);

    // FR-19: one query for the runs of every board.
    const sessionIds = new Set<string>();
    for (const { board } of exported) for (const run of runsOf(board)) if (SESSION_ID.test(run.sessionId)) sessionIds.add(run.sessionId);
    const storedSessions = await workspacesRepo.findStoredSessionIds([...sessionIds]);

    const groups = new Map<string, { workspace: ResolvedWorkspace; boards: FactoryBoard[] }>();
    exported.forEach(({ fileName, board }, index) => {
      const workspace = resolved[index];
      if (workspace === undefined) return;
      const group = groups.get(workspace.pathKey) ?? { workspace, boards: [] };
      group.boards.push(toBoard(fileName, board, now.getTime(), storedSessions));
      groups.set(workspace.pathKey, group);
    });

    const workspaces = [...groups.entries()].map(([key, { workspace, boards }]) => {
      const row = stored.get(key);
      return toWorkspace(
        { key, workspaceId: row?.id ?? null, name: row?.name ?? workspace.name, path: row?.path ?? workspace.path },
        boards,
      );
    });
    workspaces.sort(
      (a, b) =>
        Number(b.hasLiveRun) - Number(a.hasLiveRun) ||
        latestScan(b.boards).localeCompare(latestScan(a.boards)) ||
        a.key.localeCompare(b.key),
    );

    return { readAt, boardsDir, isBoardsDirReadable: true, unsupportedFiles, workspaces };
  }

  // Single flight: an overlapping request shares the read in progress, so the cache is never updated twice at once.
  let inflight: Promise<FactoryState> | null = null;
  function getFactoryState(): Promise<FactoryState> {
    inflight ??= readFactoryState().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return { getFactoryState };
}

export type FactoryService = ReturnType<typeof createFactoryService>;

function runsOf(board: FactoryExport): ExportRun[] {
  return [
    ...board.live,
    ...board.features.flatMap((feature) => [...(feature.autopilot === null ? [] : [feature.autopilot]), ...feature.steps.flatMap((step) => step.runs)]),
  ];
}

function toRun(run: ExportRun, storedSessions: Set<string>): FactoryRun {
  return {
    sessionId: run.sessionId,
    feature: run.feature,
    folder: run.folder,
    command: run.command,
    step: run.step,
    lastStep: run.lastStep ?? null,
    agentId: run.agentId ?? null,
    status: run.status,
    since: new Date(run.since).toISOString(),
    updatedAt: new Date(run.updatedAt).toISOString(),
    isStored: storedSessions.has(run.sessionId),
  };
}

// BR-02: the board is passed through as exported. Only the epoch-ms fields become ISO strings, the absent optional
// fields become null, and the fields the application does not draw are dropped.
function toBoard(fileName: string, board: FactoryExport, nowMs: number, storedSessions: Set<string>): FactoryBoard {
  return {
    fileName,
    root: board.root,
    branch: board.branch,
    baseBranch: board.baseBranch,
    aheadCount: board.aheadCount,
    changedCount: board.changedCount,
    scannedAt: new Date(board.scannedAt).toISOString(),
    isStale: nowMs - board.scannedAt > STALE_AFTER_MS,
    error: board.error,
    markers: { review: board.markers.review, browser: board.markers.browser },
    live: board.live.map((run) => toRun(run, storedSessions)),
    features: board.features.map(
      (feature): FactoryFeature => ({
        slug: feature.slug,
        title: feature.title,
        state: feature.state,
        isNewPlan: feature.isNewPlan,
        hasSpec: feature.hasSpec,
        specStatus: feature.specStatus,
        plan:
          feature.plan === null
            ? null
            : {
                folder: feature.plan.folder,
                title: feature.plan.title,
                stages: feature.plan.stages.map((stage) => ({
                  number: stage.number,
                  title: stage.title,
                  commit: stage.commit,
                  sha: stage.sha,
                  done: stage.done,
                  total: stage.total,
                })),
                validationDone: feature.plan.validationDone,
                validationTotal: feature.plan.validationTotal,
                reviewDone: feature.plan.reviewDone,
                isDraft: feature.plan.isDraft,
              },
        plans: feature.plans,
        autopilot: feature.autopilot === null ? null : toRun(feature.autopilot, storedSessions),
        next:
          feature.next === null
            ? null
            : {
                label: feature.next.label,
                prompt: feature.next.prompt,
                all: feature.next.all === undefined ? null : { label: feature.next.all.label, prompt: feature.next.all.prompt },
                autopilot:
                  feature.next.autopilot === undefined
                    ? null
                    : { label: feature.next.autopilot.label, prompt: feature.next.autopilot.prompt },
              },
        steps: feature.steps.map((step) => ({
          step: step.step,
          title: step.title,
          detail: step.detail,
          marker: step.marker,
          runs: step.runs.map((run) => toRun(run, storedSessions)),
        })),
      }),
    ),
  };
}

// A stale board's live runs do not count as live: no mod runs, their state is the one of the last scan (FR-11).
const hasLive = (board: FactoryBoard) => !board.isStale && board.live.length > 0;

function latestScan(boards: FactoryBoard[]): string {
  return boards.reduce((max, board) => (board.scannedAt > max ? board.scannedAt : max), "");
}

// FR-07, FR-09: the group's order key, counts and live mark come from its boards, stale ones included in the counts.
function toWorkspace(
  identity: { key: string; workspaceId: number | null; name: string; path: string },
  boards: FactoryBoard[],
): FactoryWorkspace {
  const features = boards.flatMap((board) => board.features);
  return {
    ...identity,
    hasLiveRun: boards.some(hasLive),
    counts: {
      running: features.filter((feature) => feature.state === "running").length,
      review: features.filter((feature) => feature.state === "review").length,
    },
    boards: [...boards].sort(
      (a, b) => Number(hasLive(b)) - Number(hasLive(a)) || b.scannedAt.localeCompare(a.scannedAt) || a.root.localeCompare(b.root),
    ),
  };
}
