import { bigint, boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// One row per main or subagent log file last read: a refresh re-reads a session only when one of its files changed.
export const logFiles = pgTable("log_files", {
  path: text().primaryKey(),
  sessionId: text().notNull(),
  sizeBytes: bigint({ mode: "number" }).notNull(),
  modifiedAt: timestamp({ withTimezone: true }).notNull(),
});

export const refreshRuns = pgTable("refresh_runs", {
  id: serial().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  finishedAt: timestamp({ withTimezone: true }).notNull(),
  status: text({ enum: ["succeeded", "failed"] }).notNull(),
  mode: text({ enum: ["incremental", "full"] }).notNull().default("incremental"),
  logsDir: text().notNull(),
  isLogsDirFound: boolean().notNull(),
  sessionsAdded: integer().notNull(),
  sessionsUpdated: integer().notNull(),
  sessionsArchived: integer().notNull(),
  unreadableLines: integer().notNull(),
  sessionsRead: integer().notNull().default(0),
  error: text(),
});

// The PeriodicRefresh schedule: one row (id always 1) for the whole application. No row means the default interval.
export const refreshSchedules = pgTable("refresh_schedules", {
  id: integer().primaryKey(),
  // Minutes between two periodic refreshes; null is off.
  intervalMinutes: integer(),
  updatedAt: timestamp({ withTimezone: true }).notNull(),
});
