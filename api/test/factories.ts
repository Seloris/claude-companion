import { randomUUID } from "node:crypto";
import type {
  ModelUsage,
  ParsedPrompt,
  ParsedSession,
  ParsedSkillCall,
  ParsedSubagent,
  ParsedToolCall,
} from "../src/features/ingestion/ingestion.parser.js";
import { mcpServerOf } from "../src/features/ingestion/ingestion.parser.js";
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

export function buildToolCall(overrides: Partial<ParsedToolCall> = {}): ParsedToolCall {
  const name = overrides.name ?? "Bash";
  return {
    toolUseId: `toolu_${randomUUID()}`,
    agentId: null,
    name,
    mcpServer: mcpServerOf(name),
    calledAt: new Date("2026-10-01T10:01:00.000Z"),
    isError: false,
    ...overrides,
  };
}

export function buildSkillCall(overrides: Partial<ParsedSkillCall> = {}): ParsedSkillCall {
  return {
    name: "factory:implement",
    args: null,
    calledAt: new Date("2026-10-01T10:02:00.000Z"),
    isTyped: false,
    agentId: null,
    promptPosition: null,
    ...overrides,
  };
}

export function buildSubagent(overrides: Partial<ParsedSubagent> = {}): ParsedSubagent {
  return {
    agentId: `a${randomUUID().slice(0, 8)}`,
    agentType: "factory:reviewer",
    model: "claude-opus-5-5",
    description: "Review the stage",
    launchedAt: new Date("2026-10-01T10:03:00.000Z"),
    usages: [buildUsage({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 })],
    toolCallCount: 0,
    isLogMissing: false,
    ...overrides,
  };
}

// The session's counters follow its prompts, tool calls, skill calls and subagents unless overridden.
export function buildSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  const prompts = overrides.prompts ?? [buildPrompt()];
  const toolCalls = overrides.toolCalls ?? [];
  const skillCalls = overrides.skillCalls ?? [];
  const subagents = overrides.subagents ?? [];
  return {
    sessionId: randomUUID(),
    firstCwd: "C:\\WS\\demo",
    startedAt: new Date("2026-10-01T10:00:00.000Z"),
    endedAt: new Date("2026-10-01T11:00:00.000Z"),
    gitBranch: "main",
    origin: "cli",
    title: "A session",
    promptCount: prompts.length,
    subagentCount: subagents.length,
    usages: [buildUsage()],
    unreadableLines: 0,
    toolCallCount: toolCalls.length,
    failedToolCallCount: toolCalls.filter((call) => call.isError === true).length,
    skillCallCount: skillCalls.length,
    agentTypes: [...new Set(subagents.map((subagent) => subagent.agentType))].sort(),
    ...overrides,
    prompts,
    toolCalls,
    skillCalls,
    subagents,
  };
}
