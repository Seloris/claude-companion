import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StatusFile } from "../../src/features/live/live.source.js";
import {
  SESSION_ID,
  assistantLine,
  toolResultBlock,
  toolUseBlock,
  userLine,
  type LogLine,
} from "../ingestion/log-builders.js";

// Builds status files shaped like Claude Code's own: never copies of real ones.
export const LIVE_STARTED_AT = Date.parse("2026-10-01T10:00:00.000Z");

export function statusFile(overrides: Partial<StatusFile> = {}): StatusFile {
  return {
    pid: 4242,
    sessionId: SESSION_ID,
    cwd: "C:\\WS\\demo",
    startedAt: LIVE_STARTED_AT,
    entrypoint: "cli",
    status: "idle",
    statusUpdatedAt: LIVE_STARTED_AT + 60_000,
    updatedAt: LIVE_STARTED_AT + 60_000,
    ...overrides,
  };
}

// A string content is written as is: the way to write a file Claude Code is half way through rewriting.
export async function writeStatusFile(
  sessionsDir: string,
  file: StatusFile,
  options: { fileName?: string; content?: string } = {},
): Promise<string> {
  await mkdir(sessionsDir, { recursive: true });
  const target = path.join(sessionsDir, options.fileName ?? `${file.pid}.json`);
  await writeFile(target, options.content ?? JSON.stringify(file));
  return target;
}

// Log lines on a timeline: second 0 is LIVE_STARTED_AT.
export const at = (second: number) => new Date(LIVE_STARTED_AT + second * 1000).toISOString();

interface LineOptions {
  sessionId?: string;
  cwd?: string;
}

export function promptLine(text: string, second: number, options: LineOptions = {}): LogLine {
  return userLine(text, { timestamp: at(second), ...options });
}

// A message Claude Code sends by itself: a background task's notification, or another session's message. Written with
// `turnOrigin` when it restarts Claude; `isTranscriptOnly` writes the record of a notification that started no turn.
export function restartLine(
  origin: "task-notification" | "peer",
  text: string,
  second: number,
  { isTranscriptOnly = false }: { isTranscriptOnly?: boolean } = {},
): LogLine {
  const restart = isTranscriptOnly
    ? { queueTranscriptOnly: true }
    : { turnOrigin: origin === "peer" ? "peer" : "task_notification", turnPosition: { promptIndex: 2, turnIndex: 3 } };
  return userLine(text, {
    timestamp: at(second),
    extra: { origin: { kind: origin }, promptSource: "system", ...(origin === "peer" ? { isMeta: true } : {}), ...restart },
  });
}

// An assistant message made of one tool call.
export function callLine(
  messageId: string,
  toolUseId: string,
  name: string,
  input: LogLine,
  second: number,
  options: LineOptions = {},
): LogLine {
  return assistantLine(messageId, "claude-opus-5-5", {}, {
    timestamp: at(second),
    content: [toolUseBlock(toolUseId, name, input)],
    ...options,
  });
}

export function answerLine(toolUseId: string, second: number, toolUseResult?: LogLine, options: LineOptions = {}): LogLine {
  return userLine([toolResultBlock(toolUseId)], {
    timestamp: at(second),
    extra: toolUseResult === undefined ? {} : { toolUseResult },
    ...options,
  });
}
