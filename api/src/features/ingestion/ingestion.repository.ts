import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { FileStat } from "./ingestion.source.js";
import { logFiles, refreshRuns } from "./ingestion.table.js";

export type StoredLogFile = typeof logFiles.$inferSelect;
export type NewRefreshRun = Omit<typeof refreshRuns.$inferInsert, "id">;
export type RefreshRun = typeof refreshRuns.$inferSelect;

export function createIngestionRepository(db: Database) {
  return {
    async listLogFiles(): Promise<StoredLogFile[]> {
      return db.select().from(logFiles);
    },

    async replaceLogFiles(sessionId: string, files: FileStat[]): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(logFiles).where(eq(logFiles.sessionId, sessionId));
        if (files.length === 0) return;
        await tx.insert(logFiles).values(
          files.map((file) => ({
            path: file.path,
            sessionId,
            sizeBytes: file.sizeBytes,
            modifiedAt: file.modifiedAt,
          })),
        );
      });
    },

    async deleteLogFiles(sessionId: string): Promise<void> {
      await db.delete(logFiles).where(eq(logFiles.sessionId, sessionId));
    },

    async insertRefreshRun(run: NewRefreshRun): Promise<RefreshRun> {
      const [inserted] = await db.insert(refreshRuns).values(run).returning();
      if (inserted === undefined) throw new Error("the refresh run was not inserted");
      return inserted;
    },

    async findLastRefreshRun(): Promise<RefreshRun | null> {
      const [run] = await db.select().from(refreshRuns).orderBy(desc(refreshRuns.id)).limit(1);
      return run ?? null;
    },
  };
}

export type IngestionRepository = ReturnType<typeof createIngestionRepository>;
