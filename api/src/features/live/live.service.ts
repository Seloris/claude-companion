import type { Clock } from "../../shared/clock.js";
import { haveFilesChanged, readLines, readMeta, scanSubagentFiles, statFile, type FileStat } from "../ingestion/ingestion.source.js";
import type { IngestionService } from "../ingestion/ingestion.service.js";
import { resolveWorkspace, type ResolvedWorkspace } from "../ingestion/ingestion.workspace.js";
import type { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import type { LiveSession, LiveState, LiveStatus, LiveWorkspace } from "./live.schema.js";
import { readLiveLog, type CurrentActivityRead, type LiveLog } from "./live.log.js";
import { findSessionLog, readStatusFiles, type SessionLogLocation, type StatusFile } from "./live.source.js";

// What Claude Code files as a permission wait, which cannot be told apart from a tool that runs (BR-03). A dialog that
// declares no reason is a permission dialog too.
const PERMISSION_WAITS = new Set(["permission prompt", "sandbox request", "worker request", "goal proposal"]);
const STATUS_RANK: Record<LiveStatus, number> = { awaitingAnswer: 0, running: 1, idle: 2 };

interface CachedLog {
  files: FileStat[];
  // Null: the log is too young to be parsed.
  log: LiveLog | null;
}

interface LiveEntry {
  session: LiveSession;
  workspace: ResolvedWorkspace;
}

export function createLiveService({
  workspacesRepo,
  ingestion,
  clock,
  sessionsDir,
  logsDir,
  scratchRoot,
  isPidAlive,
  findRepoRoot,
}: {
  workspacesRepo: Pick<WorkspacesRepository, "findStoredSessionIds">;
  ingestion: Pick<IngestionService, "start" | "whenIdle">;
  clock: Clock;
  sessionsDir: string;
  logsDir: string;
  scratchRoot: string;
  isPidAlive: (pid: number) => boolean;
  findRepoRoot: (cwd: string) => string | null;
}) {
  // In memory only (BR-07): the application stores nothing of the live state.
  // The last status file read OK, by file name: Claude Code rewrites them, a read can catch one half written.
  const snapshots = new Map<string, StatusFile>();
  const logLocations = new Map<string, SessionLogLocation>();
  const logCache = new Map<string, CachedLog>();
  const failedSessions = new Set<string>();
  let previousIds: Set<string> | null = null;

  // Any error on one session's files (a file vanishing, EPERM, EBUSY on Windows) leaves that session without log
  // for this read, never fails the response.
  async function loadLog(status: StatusFile): Promise<LiveLog | null> {
    const id = status.sessionId;
    try {
      let location = logLocations.get(id) ?? null;
      let main = location === null ? null : await statFile(location.mainPath).catch(() => null);
      if (location === null || main === null) {
        location = await findSessionLog(logsDir, id);
        if (location === null) {
          logLocations.delete(id);
          logCache.delete(id);
          return null;
        }
        logLocations.set(id, location);
        main = await statFile(location.mainPath);
      }
      const subagents = await scanSubagentFiles(location.folderPath, id);
      const files = [main, ...subagents];
      const cached = logCache.get(id);
      if (cached !== undefined && !haveFilesChanged(files, cached.files)) return cached.log;

      const mainLines = await readLines(main.path);
      const subagentFiles = await Promise.all(
        subagents.map(async (file) => ({ agentId: file.agentId, lines: await readLines(file.path), meta: await readMeta(file.metaPath) })),
      );
      const log = readLiveLog({ sessionId: id, mainLines, subagentFiles });
      logCache.set(id, { files, log });
      failedSessions.delete(id);
      return log;
    } catch (error) {
      if (!failedSessions.has(id)) {
        failedSessions.add(id);
        console.error(`live session ${id}: its log could not be read`, error);
      }
      return null;
    }
  }

  function toEntry(status: StatusFile, log: LiveLog | null, isStored: boolean, liveStatus: LiveStatus): LiveEntry {
    const statusSince = new Date(status.statusUpdatedAt ?? status.updatedAt ?? status.startedAt);
    const lastLineAt = log?.lastLineAt ?? null;
    const lastActivityAt = lastLineAt !== null && lastLineAt > statusSince ? lastLineAt : statusSince;
    const name = (status.name ?? "") === "" ? null : (status.name ?? null);
    // BR-06: the working directory the log opens with, as the stored history; the status file's one before the log exists.
    const workspace = resolveWorkspace(log?.firstCwd ?? status.cwd, { scratchRoot, findRepoRoot });
    const isRunning = liveStatus === "running";
    const isAwaiting = liveStatus === "awaitingAnswer";
    const activity: CurrentActivityRead | null = isRunning && log !== null ? log.activity : null;
    return {
      workspace,
      session: {
        sessionId: status.sessionId,
        title: log === null || log.isTitleFallback ? (name ?? status.sessionId) : log.title,
        status: liveStatus,
        statusSince: statusSince.toISOString(),
        startedAt: (log?.startedAt ?? new Date(status.startedAt)).toISOString(),
        lastActivityAt: lastActivityAt.toISOString(),
        origin: status.entrypoint ?? log?.origin ?? null,
        gitBranch: log?.gitBranch ?? null,
        isLogFound: log !== null,
        isStored,
        lastPrompt: log?.lastPrompt ?? null,
        question: isAwaiting ? (log?.question ?? null) : null,
        questionCount: isAwaiting && log !== null && log.question !== null ? log.questionCount : 0,
        waitingFor: isAwaiting ? (status.waitingFor ?? null) : null,
        // An idle session takes a queued prompt up at once: what is left in its queue is stale.
        queuedPrompts: liveStatus === "idle" || log === null ? [] : log.queuedPrompts,
        currentActivity: activity === null ? null : { ...activity, since: activity.since.toISOString() },
        runningSubagents:
          isRunning && log !== null
            ? log.subagents
                .filter((subagent) => subagent.isRunning)
                .map((subagent) => ({
                  agentId: subagent.agentId,
                  agentType: subagent.agentType,
                  description: subagent.description,
                  currentTool: subagent.currentTool,
                  since: subagent.launchedAt.toISOString(),
                }))
            : [],
      },
    };
  }

  // FR-13: a run in progress may have read the log before the session's last writes, so a new run follows it.
  function refreshAfterLeave(): void {
    ingestion
      .whenIdle()
      .then(() => ingestion.start())
      .catch((error: unknown) => console.error("refresh after a live session left failed", error));
  }

  async function readLiveState(): Promise<LiveState> {
    const read = await readStatusFiles(sessionsDir);
    const emptyState = (isSessionsDirReadable: boolean): LiveState => ({
      readAt: clock.now().toISOString(),
      sessionsDir,
      isSessionsDirReadable,
      counts: { running: 0, awaitingAnswer: 0, idle: 0 },
      workspaces: [],
    });
    // FR-12: nothing else is touched, so the next readable read compares with the last good one.
    if (!read.isDirReadable) return emptyState(false);

    const listed = new Set(read.files.map((file) => file.fileName));
    for (const fileName of snapshots.keys()) if (!listed.has(fileName)) snapshots.delete(fileName);
    for (const file of read.files) if (file.status !== null) snapshots.set(file.fileName, file.status);

    // BR-01: a session whose process is gone leaves at once. Liveness comes first: a file left behind by a dead
    // process must not hide the live one of the same session.
    // Two live files for one session (a resumed process): the latest wins.
    const bySession = new Map<string, StatusFile>();
    for (const file of read.files) {
      const status = snapshots.get(file.fileName);
      if (status === undefined || !isPidAlive(status.pid)) continue;
      const other = bySession.get(status.sessionId);
      if (other === undefined || updatedAtOf(status) > updatedAtOf(other)) bySession.set(status.sessionId, status);
    }
    const alive = [...bySession.values()];
    const ids = new Set(alive.map((status) => status.sessionId));
    for (const id of [...logCache.keys(), ...logLocations.keys(), ...failedSessions]) {
      if (!ids.has(id)) {
        logCache.delete(id);
        logLocations.delete(id);
        failedSessions.delete(id);
      }
    }

    const logs = await Promise.all(alive.map((status) => loadLog(status)));
    const stored = await workspacesRepo.findStoredSessionIds([...ids]);
    const entries = alive.map((status, index) =>
      toEntry(status, logs[index] ?? null, stored.has(status.sessionId), toLiveStatus(status)),
    );

    const state = emptyState(true);
    state.workspaces = groupByWorkspace(entries);
    for (const entry of entries) state.counts[entry.session.status] += 1;

    // The first read has nothing to compare with.
    if (previousIds !== null && [...previousIds].some((id) => !ids.has(id))) refreshAfterLeave();
    previousIds = ids;
    return state;
  }

  // Single flight: a read that overlaps another shares its result, so reads never finish out of order and the
  // previous ids of FR-13 only move forward.
  let inflight: Promise<LiveState> | null = null;
  function getLiveState(): Promise<LiveState> {
    inflight ??= readLiveState().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return { getLiveState };
}

export type LiveService = ReturnType<typeof createLiveService>;

function updatedAtOf(status: StatusFile): number {
  return status.updatedAt ?? status.statusUpdatedAt ?? status.startedAt;
}

// BR-02, BR-03, BR-04: the status Claude Code declares wins over what the log suggests.
function toLiveStatus(status: StatusFile): LiveStatus {
  if (status.status === "busy") return "running";
  if (status.status !== "waiting") return "idle";
  const reason = status.waitingFor ?? null;
  return reason === null || PERMISSION_WAITS.has(reason) ? "running" : "awaitingAnswer";
}

// FR-01: sessions by status, then most recent; workspaces holding a question first, then most recent.
function groupByWorkspace(entries: LiveEntry[]): LiveWorkspace[] {
  const groups = new Map<string, { workspace: ResolvedWorkspace; sessions: LiveSession[] }>();
  for (const { workspace, session } of entries) {
    const group = groups.get(workspace.pathKey) ?? { workspace, sessions: [] };
    group.sessions.push(session);
    groups.set(workspace.pathKey, group);
  }
  const workspaces = [...groups.values()].map(({ workspace, sessions }) => ({
    key: workspace.pathKey,
    name: workspace.name,
    isScratch: workspace.isScratch,
    sessions: sessions.sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        b.lastActivityAt.localeCompare(a.lastActivityAt) ||
        a.sessionId.localeCompare(b.sessionId),
    ),
  }));
  const hasQuestion = (workspace: LiveWorkspace) => workspace.sessions.some((session) => session.status === "awaitingAnswer");
  const latest = (workspace: LiveWorkspace) => workspace.sessions.reduce((max, session) => (session.lastActivityAt > max ? session.lastActivityAt : max), "");
  return workspaces.sort(
    (a, b) =>
      Number(hasQuestion(b)) - Number(hasQuestion(a)) || latest(b).localeCompare(latest(a)) || a.key.localeCompare(b.key),
  );
}
