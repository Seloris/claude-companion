import { randomUUID } from "node:crypto";
import type { ModelUsage, ParsedPrompt, ParsedSession } from "../src/features/ingestion/ingestion.parser.js";
import type { ResolvedWorkspace } from "../src/features/ingestion/ingestion.workspace.js";

// One `build{Entity}(overrides)` per entity: the only way a test builds a row.

export function buildWorkspace(overrides: Partial<ResolvedWorkspace> = {}): ResolvedWorkspace {
  const name = overrides.name ?? `workspace-${randomUUID().slice(0, 8)}`;
  const workspacePath = overrides.path ?? `C:\\WS\\${name}`;
  return {
    pathKey: workspacePath.replace(/\\/g, "/").toLowerCase(),
    path: workspacePath,
    name,
    isScratch: false,
    ...overrides,
  };
}

export function buildUsage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return {
    model: "claude-opus-5-5",
    inputTokens: 100,
    outputTokens: 200,
    cacheReadTokens: 300,
    cacheWriteTokens: 400,
    ...overrides,
  };
}

export function buildPrompt(overrides: Partial<ParsedPrompt> = {}): ParsedPrompt {
  return { text: "Fix the login page", sentAt: new Date("2026-10-01T10:00:00.000Z"), ...overrides };
}

export function buildSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  const prompts = overrides.prompts ?? [buildPrompt()];
  return {
    sessionId: randomUUID(),
    firstCwd: "C:\\WS\\demo",
    startedAt: new Date("2026-10-01T10:00:00.000Z"),
    endedAt: new Date("2026-10-01T11:00:00.000Z"),
    gitBranch: "main",
    origin: "cli",
    title: "A session",
    promptCount: prompts.length,
    subagentCount: 0,
    usages: [buildUsage()],
    unreadableLines: 0,
    ...overrides,
    prompts,
  };
}
