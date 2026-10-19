import type { Clock } from "../../shared/clock.js";
import type { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import { parseSession } from "./ingestion.parser.js";
import type { IngestionRepository, RefreshRun, StoredLogFile } from "./ingestion.repository.js";
import type { RefreshReport, RefreshStatus } from "./ingestion.schema.js";
import { readLines, scanLogs, type FileStat, type ScannedSession } from "./ingestion.source.js";
import { findRepoRoot, resolveWorkspace } from "./ingestion.workspace.js";

export function createIngestionService({
  ingestionRepo,
  workspacesRepo,
  clock,
  logsDir,
  scratchRoot,
}: {
  ingestionRepo: IngestionRepository;
  workspacesRepo: WorkspacesRepository;
  clock: Clock;
  logsDir: string;
  scratchRoot: string;
}) {
  // In memory: only finished runs are stored, and one process serves the application.
  let running: Promise<void> | null = null;
  let runningStartedAt: Date | null = null;

  async function findLastReport(): Promise<RefreshReport | null> {
    const run = await ingestionRepo.findLastRefreshRun();
    return run === null ? null : toReport(run);
  }

  async function refresh(): Promise<RefreshReport> {
    const startedAt = clock.now();
    const counts = { sessionsAdded: 0, sessionsUpdated: 0, sessionsArchived: 0, unreadableLines: 0 };
    let isLogsDirFound = false;
    let error: string | null = null;
    try {
      const scan = await scanLogs(logsDir);
      isLogsDirFound = scan.isLogsDirFound;
      const stored = groupBySession(await ingestionRepo.listLogFiles());

      for (const session of scan.sessions) {
        if (!hasChanged(session, stored.get(session.sessionId) ?? [])) continue;
        let mainLines: string[];
        let subagentFiles: string[][];
        try {
          mainLines = await readLines(session.mainFile.path);
          subagentFiles = await Promise.all(session.subagentFiles.map((file) => readLines(file.path)));
        } catch (caught) {
          // A file removed or locked since the scan: its stored files stay as they were, so the next refresh retries it.
          console.error(`session ${session.sessionId} could not be read`, caught);
          continue;
        }
        const parsed = parseSession({ sessionId: session.sessionId, mainLines, subagentFiles });
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
    } catch (caught) {
      console.error("refresh failed", caught);
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const run = await ingestionRepo.insertRefreshRun({
      startedAt,
      finishedAt: clock.now(),
      status: error === null ? "succeeded" : "failed",
      logsDir,
      isLogsDirFound,
      ...counts,
      error,
    });
    return toReport(run);
  }

  return {
    // BR-06: the running flag is set before any await, so a second call always sees it.
    async start(): Promise<RefreshStatus> {
      if (running === null) {
        runningStartedAt = clock.now();
        running = refresh()
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
  const scanned: FileStat[] = [session.mainFile, ...session.subagentFiles];
  if (scanned.length !== stored.length) return true;
  const storedByPath = new Map(stored.map((file) => [file.path, file]));
  return scanned.some((file) => {
    const previous = storedByPath.get(file.path);
    return (
      previous === undefined ||
      previous.sizeBytes !== file.sizeBytes ||
      previous.modifiedAt.getTime() !== file.modifiedAt.getTime()
    );
  });
}

function toReport(run: RefreshRun): RefreshReport {
  return {
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt.toISOString(),
    durationMs: run.finishedAt.getTime() - run.startedAt.getTime(),
    isLogsDirFound: run.isLogsDirFound,
    sessionsAdded: run.sessionsAdded,
    sessionsUpdated: run.sessionsUpdated,
    sessionsArchived: run.sessionsArchived,
    unreadableLines: run.unreadableLines,
  };
}
