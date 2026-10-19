import { bigint, boolean, index, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: serial().primaryKey(),
  // The resolved path, separators normalised and lower-cased: case variants of one folder are one workspace.
  pathKey: text().notNull().unique(),
  path: text().notNull(),
  name: text().notNull(),
  isScratch: boolean().notNull().default(false),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    workspaceId: integer()
      .notNull()
      .references(() => workspaces.id),
    title: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    gitBranch: text(),
    origin: text(),
    promptCount: integer().notNull(),
    subagentCount: integer().notNull(),
    isArchived: boolean().notNull().default(false),
  },
  (table) => [index().on(table.workspaceId, table.startedAt)],
);

export const sessionModelUsages = pgTable(
  "session_model_usages",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    model: text().notNull(),
    inputTokens: bigint({ mode: "number" }).notNull(),
    outputTokens: bigint({ mode: "number" }).notNull(),
    cacheReadTokens: bigint({ mode: "number" }).notNull(),
    cacheWriteTokens: bigint({ mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.model] })],
);

export const prompts = pgTable(
  "prompts",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    text: text().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.position] })],
);
