import type { Clock } from "../../shared/clock.js";
import type { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import { parseSession, type SubagentFile } from "./ingestion.parser.js";
import type { IngestionRepository, RefreshRun, StoredLogFile } from "./ingestion.repository.js";
import type { RefreshMode, RefreshReport, RefreshStatus } from "./ingestion.schema.js";
import { readStatusFiles } from "../live/live.source.js";
import { desktopSessionIdOf } from "./ingestion.reopen.js";
import { haveFilesChanged, readLines, readMeta, scanLogs, type ScannedSession } from "./ingestion.source.js";
import { findRepoRoot, resolveWorkspace } from "./ingestion.workspace.js";

export function createIngestionService({
  ingestionRepo,
  workspacesRepo,
  clock,
  logsDir,
  sessionsDir,
  scratchRoot,
}: {
  ingestionRepo: IngestionRepository;
  workspacesRepo: WorkspacesRepository;
  clock: Clock;
  logsDir: string;
  // Claude Code's live state, read only for the desktop ids of the sessions (BR-19).
  sessionsDir: string;
  scratchRoot: string;
}) {
  // In memory: only finished runs are stored, and one process serves the application.
  let running: Promise<void> | null = null;
  let runningStartedAt: Date | null = null;

  async function findLastReport(): Promise<RefreshReport | null> {
    const run = await ingestionRepo.findLastRefreshRun();
    return run === null ? null : toReport(run);
  }

  // BR-19: alive or not, since the mapping does not depend on liveness. readStatusFiles opens only the {pid}.json files:
  // the *.key files beside them hold credentials and are never opened. The link is secondary to the history: a failure
  // here is logged, and never fails the refresh nor changes its report.
  async function recordDesktopSessions(): Promise<void> {
    try {
      const { files } = await readStatusFiles(sessionsDir);
      const seenAt = clock.now();
      // One entry per session: the file of a dead process may sit beside the one of its respawn, and one statement
      // cannot update a row twice. The freshest file wins.
      const freshest = new Map<string, { desktopSessionId: string; stamp: number }>();
      for (const { status } of files) {
        if (status === null) continue;
        const desktopSessionId = desktopSessionIdOf(status);
        if (desktopSessionId === null) continue;
        const stamp = status.statusUpdatedAt ?? status.updatedAt ?? status.startedAt;
        const known = freshest.get(status.sessionId);
        if (known === undefined || stamp >= known.stamp) freshest.set(status.sessionId, { desktopSessionId, stamp });
      }
      await workspacesRepo.saveDesktopSessionIds(
        [...freshest].map(([sessionId, { desktopSessionId }]) => ({ sessionId, desktopSessionId, seenAt })),
      );
    } catch (caught) {
      console.error("desktop session ids could not be recorded", caught);
    }
  }

  async function refresh({ mode = "incremental" }: { mode?: RefreshMode } = {}): Promise<RefreshReport> {
    const startedAt = clock.now();
    const counts = { sessionsRead: 0, sessionsAdded: 0, sessionsUpdated: 0, sessionsArchived: 0, unreadableLines: 0 };
    let isLogsDirFound = false;
    let error: string | null = null;
    try {
      const scan = await scanLogs(logsDir);
      isLogsDirFound = scan.isLogsDirFound;
      const stored = groupBySession(await ingestionRepo.listLogFiles());
      const missingStartFolder = new Set(await workspacesRepo.listSessionIdsMissingStartFolder());

      for (const session of scan.sessions) {
        // FR-05: a full refresh re-reads every session, so the ones stored before an update get the new data.
        // BR-16: so does an incremental one for a stored session still missing its start folder (a backfill, once).
        if (
          mode === "incremental" &&
          !hasChanged(session, stored.get(session.sessionId) ?? []) &&
          !missingStartFolder.has(session.sessionId)
        ) {
          continue;
        }
        let mainLines: string[];
        let subagentFiles: SubagentFile[];
        try {
          mainLines = await readLines(session.mainFile.path);
          subagentFiles = await Promise.all(
            session.subagentFiles.map(async (file) => ({
              agentId: file.agentId,
              lines: await readLines(file.path),
              meta: await readMeta(file.metaPath),
            })),
          );
        } catch (caught) {
          // A file removed or locked since the scan: its stored files stay as they were, so the next refresh retries it.
          console.error(`session ${session.sessionId} could not be read`, caught);
          continue;
        }
        const parsed = parseSession({ sessionId: session.sessionId, mainLines, subagentFiles });
        counts.sessionsRead += 1;
        if (parsed !== null) {
          counts.unreadableLines += parsed.unreadableLines;
          const workspace = resolveWorkspace(parsed.firstCwd, { scratchRoot, findRepoRoot });
          const outcome = await workspacesRepo.saveSession(workspace, parsed);
          if (outcome === "added") counts.sessionsAdded += 1;
          else counts.sessionsUpdated += 1;
        }
        // Recorded even without a working directory yet: such a file is re-read only once it changes.
        await ingestionRepo.replaceLogFiles(session.sessionId, [session.mainFile, ...session.subagentFiles]);
      }

      // BR-05: a session whose log file is gone is archived, never deleted. BR-11: a missing folder archives none.
      if (scan.isLogsDirFound) {
        const scannedIds = new Set(scan.sessions.map((session) => session.sessionId));
        const gone = (await workspacesRepo.listSessionIds({ isArchived: false })).filter((id) => !scannedIds.has(id));
        await workspacesRepo.archiveSessions(gone);
        for (const id of gone) await ingestionRepo.deleteLogFiles(id);
        counts.sessionsArchived = gone.length;
      }

      await recordDesktopSessions();
    } catch (caught) {
      console.error("refresh failed", caught);
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const run = await ingestionRepo.insertRefreshRun({
      startedAt,
      finishedAt: clock.now(),
      status: error === null ? "succeeded" : "failed",
      mode,
      logsDir,
      isLogsDirFound,
      ...counts,
      error,
    });
    return toReport(run);
  }

  return {
    // BR-06: the running flag is set before any await, so a second call always sees it.
    // A call while a run is in progress returns that run's status, whatever its mode.
    async start({ mode = "incremental" }: { mode?: RefreshMode } = {}): Promise<RefreshStatus> {
      if (running === null) {
        runningStartedAt = clock.now();
        running = refresh({ mode })
          .then(
            () => undefined,
            (caught: unknown) => console.error("refresh could not be recorded", caught),
          )
          .finally(() => {
            running = null;
            runningStartedAt = null;
          });
      }
      const startedAt = runningStartedAt;
      return {
        isRunning: true,
        startedAt: startedAt?.toISOString() ?? null,
        logsDir,
        lastReport: await findLastReport(),
      };
    },

    refresh,

    async getStatus(): Promise<RefreshStatus> {
      return {
        isRunning: running !== null,
        startedAt: runningStartedAt?.toISOString() ?? null,
        logsDir,
        lastReport: await findLastReport(),
      };
    },

    async whenIdle(): Promise<void> {
      await running;
    },
  };
}

export type IngestionService = ReturnType<typeof createIngestionService>;

function groupBySession(files: StoredLogFile[]): Map<string, StoredLogFile[]> {
  const bySession = new Map<string, StoredLogFile[]>();
  for (const file of files) {
    const sessionFiles = bySession.get(file.sessionId) ?? [];
    sessionFiles.push(file);
    bySession.set(file.sessionId, sessionFiles);
  }
  return bySession;
}

// FR-02: a session is re-read when one of its files is new, changed or gone since the last refresh.
function hasChanged(session: ScannedSession, stored: StoredLogFile[]): boolean {
  return haveFilesChanged([session.mainFile, ...session.subagentFiles], stored);
}

function toReport(run: RefreshRun): RefreshReport {
  return {
    status: run.status,
    mode: run.mode,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt.toISOString(),
    durationMs: run.finishedAt.getTime() - run.startedAt.getTime(),
    isLogsDirFound: run.isLogsDirFound,
    sessionsRead: run.sessionsRead,
    sessionsAdded: run.sessionsAdded,
    sessionsUpdated: run.sessionsUpdated,
    sessionsArchived: run.sessionsArchived,
    unreadableLines: run.unreadableLines,
  };
}
