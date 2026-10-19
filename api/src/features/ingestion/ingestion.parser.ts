import { z } from "zod";

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ParsedPrompt {
  text: string;
  sentAt: Date;
}

export interface ParsedSession {
  sessionId: string;
  firstCwd: string;
  startedAt: Date;
  endedAt: Date;
  gitBranch: string | null;
  origin: string | null;
  title: string;
  promptCount: number;
  subagentCount: number;
  usages: ModelUsage[];
  prompts: ParsedPrompt[];
  unreadableLines: number;
}

// Loose schemas: Claude Code adds fields often, the parser narrows only the ones it uses.
const lineSchema = z.looseObject({
  type: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.iso.datetime().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  entrypoint: z.string().optional(),
});

const customTitleSchema = z.looseObject({ type: z.literal("custom-title"), customTitle: z.string() });
const aiTitleSchema = z.looseObject({ type: z.literal("ai-title"), aiTitle: z.string() });

const assistantSchema = z.looseObject({
  type: z.literal("assistant"),
  message: z.looseObject({
    id: z.string(),
    model: z.string(),
    usage: z.looseObject({
      input_tokens: z.number().default(0),
      output_tokens: z.number().default(0),
      cache_read_input_tokens: z.number().nullish(),
      cache_creation_input_tokens: z.number().nullish(),
    }),
  }),
});

const contentBlockSchema = z.looseObject({ type: z.string(), text: z.string().optional() });

const userSchema = z.looseObject({
  type: z.literal("user"),
  timestamp: z.iso.datetime(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  isVisibleInTranscriptOnly: z.boolean().optional(),
  origin: z.looseObject({ kind: z.string() }).optional(),
  message: z.looseObject({ content: z.union([z.string(), z.array(contentBlockSchema)]) }),
});

type Line = z.infer<typeof lineSchema>;

const SYNTHETIC_MODEL = "<synthetic>";
const TITLE_LENGTH = 80;
// Text blocks Claude Code injects into a user line: not something the person typed.
const INJECTED_PREFIXES = ["<system-reminder>", "<local-command-", "<task-notification>", "[Request interrupted"];

export function parseSession(input: {
  sessionId: string;
  mainLines: string[];
  subagentFiles: string[][];
}): ParsedSession | null {
  const { sessionId } = input;
  let unreadableLines = 0;
  const readLines = (rawLines: string[]): Line[] => {
    const lines: Line[] = [];
    for (const raw of rawLines) {
      if (raw.trim() === "") continue;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        unreadableLines += 1;
        continue;
      }
      const line = lineSchema.safeParse(value);
      // A copied line of a forked or resumed session belongs to that other session.
      if (line.success && (line.data.sessionId === undefined || line.data.sessionId === sessionId)) {
        lines.push(line.data);
      }
    }
    return lines;
  };

  const mainLines = readLines(input.mainLines);
  const subagentLines = input.subagentFiles.map(readLines);

  const firstCwd = mainLines.find((line) => line.cwd !== undefined && line.cwd !== "")?.cwd;
  if (firstCwd === undefined) return null;

  let startedAt: Date | undefined;
  let endedAt: Date | undefined;
  let gitBranch: string | null = null;
  let origin: string | null = null;
  let customTitle: string | undefined;
  let aiTitle: string | undefined;
  const prompts: ParsedPrompt[] = [];

  for (const line of mainLines) {
    if (line.timestamp !== undefined) {
      const time = new Date(line.timestamp);
      if (startedAt === undefined || time < startedAt) startedAt = time;
      if (endedAt === undefined || time > endedAt) endedAt = time;
    }
    if (line.gitBranch !== undefined && line.gitBranch !== "") gitBranch = line.gitBranch;
    if (origin === null && line.entrypoint !== undefined && line.entrypoint !== "") origin = line.entrypoint;

    const custom = customTitleSchema.safeParse(line);
    if (custom.success) customTitle = custom.data.customTitle;
    const ai = aiTitleSchema.safeParse(line);
    if (ai.success) aiTitle = ai.data.aiTitle;

    const prompt = toPrompt(line);
    if (prompt !== null) prompts.push(prompt);
  }

  const usages = sumUsages([mainLines, ...subagentLines].flat());
  // A main file with a cwd always has a timestamped line; the fallback only satisfies the type.
  const start = startedAt ?? new Date(0);

  return {
    sessionId,
    firstCwd,
    startedAt: start,
    endedAt: endedAt ?? start,
    gitBranch,
    origin,
    title: customTitle ?? aiTitle ?? titleFromPrompt(prompts[0]?.text) ?? sessionId,
    promptCount: prompts.length,
    subagentCount: input.subagentFiles.length,
    usages,
    prompts,
    unreadableLines,
  };
}

function toPrompt(line: Line): ParsedPrompt | null {
  const user = userSchema.safeParse(line);
  if (!user.success) return null;
  const { data } = user;
  if (data.isMeta === true || data.isSidechain === true) return null;
  if (data.isCompactSummary === true || data.isVisibleInTranscriptOnly === true) return null;
  if (data.origin !== undefined && data.origin.kind !== "human") return null;

  const blocks =
    typeof data.message.content === "string"
      ? [data.message.content]
      : data.message.content.flatMap((block) => (block.type === "text" && block.text !== undefined ? [block.text] : []));
  const texts = blocks.flatMap((text) => {
    if (INJECTED_PREFIXES.some((prefix) => text.trimStart().startsWith(prefix))) return [];
    const command = toCommand(text);
    const kept = (command ?? text).trim();
    return kept === "" ? [] : [kept];
  });
  if (texts.length === 0) return null;
  return { text: texts.join("\n\n"), sentAt: new Date(data.timestamp) };
}

function toCommand(text: string): string | null {
  const name = readTag(text, "command-name");
  if (name === undefined) return null;
  const args = readTag(text, "command-args") ?? "";
  return args === "" ? name : `${name} ${args}`;
}

function readTag(text: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1]?.trim();
}

function titleFromPrompt(prompt: string | undefined): string | undefined {
  if (prompt === undefined) return undefined;
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_LENGTH ? `${oneLine.slice(0, TITLE_LENGTH).trimEnd()}…` : oneLine;
}

function sumUsages(lines: Line[]): ModelUsage[] {
  // Claude Code repeats the message's usage on every content-block line, the output count growing as it streams:
  // each message counts once, with its largest counters.
  const byMessage = new Map<string, ModelUsage>();
  for (const line of lines) {
    const assistant = assistantSchema.safeParse(line);
    if (!assistant.success) continue;
    const { id, model, usage } = assistant.data.message;
    if (model === SYNTHETIC_MODEL) continue;
    const previous = byMessage.get(id);
    byMessage.set(id, {
      model,
      inputTokens: Math.max(previous?.inputTokens ?? 0, usage.input_tokens),
      outputTokens: Math.max(previous?.outputTokens ?? 0, usage.output_tokens),
      cacheReadTokens: Math.max(previous?.cacheReadTokens ?? 0, usage.cache_read_input_tokens ?? 0),
      cacheWriteTokens: Math.max(previous?.cacheWriteTokens ?? 0, usage.cache_creation_input_tokens ?? 0),
    });
  }
  const byModel = new Map<string, ModelUsage>();
  for (const message of byMessage.values()) {
    const total = byModel.get(message.model) ?? {
      model: message.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    total.inputTokens += message.inputTokens;
    total.outputTokens += message.outputTokens;
    total.cacheReadTokens += message.cacheReadTokens;
    total.cacheWriteTokens += message.cacheWriteTokens;
    byModel.set(message.model, total);
  }
  return [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model));
}
