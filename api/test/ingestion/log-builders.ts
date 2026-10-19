import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Builds log lines shaped like Claude Code's own: never copies of real logs.
export const SESSION_ID = "0b6f1e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

export type LogLine = Record<string, unknown>;

interface LineOptions {
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  entrypoint?: string;
  extra?: LogLine;
}

function base(type: string, options: LineOptions): LogLine {
  return {
    type,
    sessionId: options.sessionId ?? SESSION_ID,
    timestamp: options.timestamp ?? "2026-10-01T10:00:00.000Z",
    cwd: options.cwd ?? "C:\\WS\\demo",
    ...(options.gitBranch === undefined ? {} : { gitBranch: options.gitBranch }),
    entrypoint: options.entrypoint ?? "cli",
  };
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: LogLine }
  | { type: "tool_result"; tool_use_id: string; content: string };

export function userLine(content: string | ContentBlock[], options: LineOptions = {}): LogLine {
  return {
    ...base("user", options),
    isSidechain: false,
    origin: { kind: "human" },
    message: { role: "user", content },
    ...options.extra,
  };
}

export function commandLine(
  name: string,
  args: string | undefined,
  options: LineOptions & { isArgsFirst?: boolean } = {},
): LogLine {
  const nameTags = `<command-message>${name.replace(/^\//, "")}</command-message>\n<command-name>${name}</command-name>`;
  const argsTag = args === undefined ? "" : `<command-args>${args}</command-args>`;
  const text = options.isArgsFirst === true ? `${argsTag}\n${nameTags}` : `${nameTags}\n${argsTag}`;
  return userLine(text, options);
}

export interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function assistantLine(messageId: string, model: string, usage: Usage, options: LineOptions = {}): LogLine {
  return {
    ...base("assistant", options),
    message: {
      id: messageId,
      model,
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      usage: {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
      },
    },
    ...options.extra,
  };
}

export function titleLine(kind: "custom" | "ai", title: string, sessionId = SESSION_ID): LogLine {
  return kind === "custom"
    ? { type: "custom-title", customTitle: title, sessionId }
    : { type: "ai-title", aiTitle: title, sessionId };
}

export function toJsonl(lines: (LogLine | string)[]): string {
  return lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n";
}

// A string line is written as is: the way to write an unreadable line.
export function toLines(lines: (LogLine | string)[]): string[] {
  return lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line)));
}

export interface SessionFiles {
  mainFile: string;
  subagentFiles: string[];
}

export async function writeSession(
  logsDir: string,
  folder: string,
  session: { sessionId?: string; lines: (LogLine | string)[]; subagents?: (LogLine | string)[][] },
): Promise<SessionFiles> {
  const sessionId = session.sessionId ?? SESSION_ID;
  const folderPath = path.join(logsDir, folder);
  await mkdir(folderPath, { recursive: true });
  const mainFile = path.join(folderPath, `${sessionId}.jsonl`);
  await writeFile(mainFile, toJsonl(session.lines));
  const subagentFiles: string[] = [];
  const subagentsDir = path.join(folderPath, sessionId, "subagents");
  for (const [index, lines] of (session.subagents ?? []).entries()) {
    await mkdir(subagentsDir, { recursive: true });
    const file = path.join(subagentsDir, `agent-a${index}.jsonl`);
    await writeFile(file, toJsonl(lines));
    // Real subagent folders hold these beside the log: the scan must ignore them.
    await writeFile(path.join(subagentsDir, `agent-a${index}.meta.json`), "{}");
    subagentFiles.push(file);
  }
  return { mainFile, subagentFiles };
}
