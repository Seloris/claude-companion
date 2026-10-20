import type { Clock } from "../../shared/clock.js";
import type { IngestionRepository } from "../ingestion/ingestion.repository.js";
import { isFileUnread, scanLogs, type FileStat } from "../ingestion/ingestion.source.js";
import type { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import type { LogRetentionStatus } from "./retention.schema.js";
import { readLogRetention } from "./retention.source.js";

// session-ingestion FR-15: the warning window.
export const RETENTION_WARNING_DAYS = 7;

const MS_PER_DAY = 86_400_000;

export function createRetentionService({
  ingestionRepo,
  workspacesRepo,
  clock,
  logsDir,
  settingsFile,
}: {
  ingestionRepo: IngestionRepository;
  workspacesRepo: WorkspacesRepository;
  clock: Clock;
  logsDir: string;
  settingsFile: string;
}) {
  return {
    // Computed on request, not during a refresh: right after a refresh nothing is unread, the state that matters
    // builds up between refreshes. Reads only (readdir, stat, readFile).
    async getRetention(): Promise<LogRetentionStatus> {
      const { retentionDays, isDefault } = await readLogRetention(settingsFile);
      const scan = await scanLogs(logsDir);
      const files: FileStat[] = scan.sessions.flatMap((session) => [session.mainFile, ...session.subagentFiles]);
      const storedByPath = new Map((await ingestionRepo.listLogFiles()).map((file) => [file.path, file]));

      // BR-14: a file's deletion date is its last change plus the retention.
      const warnBefore = clock.now().getTime() + RETENTION_WARNING_DAYS * MS_PER_DAY;
      const atRiskDeletions = files
        .filter((file) => isFileUnread(file, storedByPath.get(file.path)))
        .map((file) => file.modifiedAt.getTime() + retentionDays * MS_PER_DAY)
        // Overdue dates count: Claude Code cleans up when it starts, so an overdue file may still be there.
        .filter((deletionAt) => deletionAt < warnBefore);

      const oldest = earliest(files.map((file) => file.modifiedAt.getTime()));
      const nearest = earliest(atRiskDeletions);
      return {
        retentionDays,
        isDefault,
        oldestLogAt: oldest === null ? null : new Date(oldest).toISOString(),
        // Scratch sessions count: the warning is about data loss, which no display switch changes.
        archivedSessionCount: await workspacesRepo.countSessions({ isArchived: true }),
        unreadAtRisk: {
          fileCount: atRiskDeletions.length,
          nearestDeletionAt: nearest === null ? null : new Date(nearest).toISOString(),
        },
      };
    },
  };
}

// A loop, not Math.min(...values): a long history exceeds the engine's argument limit.
function earliest(timestamps: number[]): number | null {
  return timestamps.reduce<number | null>((min, value) => (min === null || value < min ? value : min), null);
}

export type RetentionService = ReturnType<typeof createRetentionService>;
