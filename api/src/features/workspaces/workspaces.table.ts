import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
    // Defaults: the sessions stored before the activity was read get it from a full refresh.
    toolCallCount: integer().notNull().default(0),
    failedToolCallCount: integer().notNull().default(0),
    skillCallCount: integer().notNull().default(0),
    agentTypes: text().array().notNull().default([]),
    // The first working directory (BR-16, session-ingestion BR-09), where `claude --resume` finds the session. Null for
    // a session stored before it existed, until the next refresh re-reads it (or for good once archived).
    startFolder: text(),
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

export const toolCalls = pgTable(
  "tool_calls",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    toolUseId: text().notNull(),
    // Null: the session itself made the call, not one of its subagents.
    agentId: text(),
    name: text().notNull(),
    mcpServer: text(),
    calledAt: timestamp({ withTimezone: true }).notNull(),
    // Null: no result came (BR-08), neither a success nor a failure.
    isError: boolean(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.toolUseId] }), index().on(table.name)],
);

export const skillCalls = pgTable(
  "skill_calls",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    name: text().notNull(),
    args: text(),
    calledAt: timestamp({ withTimezone: true }).notNull(),
    isTyped: boolean().notNull(),
    agentId: text(),
    // The prompt a typed skill call is: the timeline shows it once.
    promptPosition: integer(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.position] })],
);

export const subagents = pgTable(
  "subagents",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    agentId: text().notNull(),
    agentType: text().notNull(),
    model: text(),
    description: text().notNull(),
    launchedAt: timestamp({ withTimezone: true }).notNull(),
    toolCallCount: integer().notNull(),
    isLogMissing: boolean().notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.agentId] })],
);

export const subagentModelUsages = pgTable(
  "subagent_model_usages",
  {
    sessionId: text().notNull(),
    agentId: text().notNull(),
    model: text().notNull(),
    inputTokens: bigint({ mode: "number" }).notNull(),
    outputTokens: bigint({ mode: "number" }).notNull(),
    cacheReadTokens: bigint({ mode: "number" }).notNull(),
    cacheWriteTokens: bigint({ mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.agentId, table.model] }),
    foreignKey({ columns: [table.sessionId, table.agentId], foreignColumns: [subagents.sessionId, subagents.agentId] }).onDelete(
      "cascade",
    ),
  ],
);

// No foreign key to `sessions`: the row must survive saveSession's delete and re-insert and the archive, since Claude
// Code's live state no longer holds the desktop id once the process ends (BR-19).
export const desktopSessionLinks = pgTable("desktop_session_links", {
  // The CLI session id.
  sessionId: text().primaryKey(),
  // The desktop app's own id of the session: local_<uuid>.
  desktopSessionId: text().notNull(),
  seenAt: timestamp({ withTimezone: true }).notNull(),
});
