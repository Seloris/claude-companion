import { z } from "zod";
import {
  AGENT_TOOLS,
  DEFAULT_AGENT_TYPE,
  SKILL_TOOL,
  agentInputSchema,
  isInjectedText,
  parseLogLines,
  parseSession,
  readToolBlocks,
  type ParsedLine,
  type ParsedSession,
  type SubagentFile,
  type ToolBlocks,
  type ToolResultInfo,
  type ToolUseBlock,
} from "../ingestion/ingestion.parser.js";

// Pure: the live reading of one session from the lines of its log files, no I/O.

const TEXT_CAP = 300;
const ASK_TOOL = "AskUserQuestion";
const BACKGROUND_STATUS = "async_launched";
// Machine-made queue items: <task-notification>, <agent-message ...>, <cross-session-message ...>.
const TAG_START = /^<[a-z][\w:-]*[\s>]/i;
const NOTIFICATION = /<task-notification>[\s\S]*?<\/task-notification>/g;
const TASK_ID = /<task-id>\s*([^<\s]+)\s*<\/task-id>/;

type ActivityKind =
  | { kind: "tool"; toolName: string }
  | { kind: "agent"; agentType: string; description: string }
  | { kind: "subagents" }
  | { kind: "thinking" };

// `skill`: the skill the session is running, a context of the step more than a step of its own.
export type CurrentActivityRead = ActivityKind & { skill: string | null; since: Date };

export interface LiveSubagent {
  agentId: string;
  agentType: string;
  description: string;
  launchedAt: Date;
  isRunning: boolean;
  // The tool the subagent is calling now, null when it is thinking.
  currentTool: string | null;
}

export interface LiveLog {
  firstCwd: string;
  title: string;
  // The session has no title yet: the title is its id.
  isTitleFallback: boolean;
  gitBranch: string | null;
  origin: string | null;
  startedAt: Date;
  lastPrompt: string | null;
  lastLineAt: Date | null;
  activity: CurrentActivityRead;
  question: string | null;
  questionCount: number;
  queuedPrompts: string[];
  subagents: LiveSubagent[];
}

const queueSchema = z.looseObject({
  type: z.literal("queue-operation"),
  operation: z.string(),
  content: z.unknown().optional(),
});

const textBlockSchema = z.looseObject({ type: z.literal("text"), text: z.string() });

const userTextSchema = z.looseObject({
  type: z.literal("user"),
  message: z.looseObject({
    content: z.union([z.string(), z.array(z.looseObject({ type: z.string(), text: z.string().optional() }))]),
  }),
});

const askInputSchema = z.looseObject({
  questions: z.array(z.looseObject({ question: z.string() })).min(1),
});

// FR-06: whitespace runs collapsed, trimmed, cut with an ellipsis.
export function shortenText(text: string, max = TEXT_CAP): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max).trimEnd()}…` : oneLine;
}

export function readLiveLog(input: { sessionId: string; mainLines: string[]; subagentFiles: SubagentFile[] }): LiveLog | null {
  const { sessionId } = input;
  const session = parseSession(input);
  if (session === null) return null;

  const main = parseLogLines(input.mainLines, sessionId).lines;
  const subagentLines = input.subagentFiles.map((file) => parseLogLines(file.lines, sessionId).lines);
  const mainBlocks = readToolBlocks(main);
  const subagentBlocks = subagentLines.map((lines) => readToolBlocks(lines));
  // The session's last activity counts the subagents' lines; the step it is on counts the main log's only: a subagent
  // writing does not restart what the session itself is doing.
  const lastLineAt = latestTimestamp([main, ...subagentLines].flat());
  const mainLastLineAt = latestTimestamp(main);

  const queue = replayQueue(main);
  const subagents = readSubagents({
    session,
    files: input.subagentFiles,
    mainBlocks,
    subagentBlocks,
    notifiedAgentIds: readNotifiedAgentIds([main, ...subagentLines].flat(), queue.enqueuedTexts),
  });

  const pending = pendingCalls(mainBlocks);
  const ask = readQuestion(pending);
  const prompt = session.prompts.at(-1);
  const skillCall =
    prompt === undefined
      ? undefined
      : session.skillCalls.filter((call) => call.agentId === null && call.calledAt >= prompt.sentAt).at(-1);

  return {
    firstCwd: session.firstCwd,
    title: session.title,
    isTitleFallback: session.title === sessionId,
    gitBranch: session.gitBranch,
    origin: session.origin,
    startedAt: session.startedAt,
    lastPrompt: prompt === undefined ? null : shortenText(prompt.text),
    lastLineAt,
    activity: {
      ...readActivityKind(pending, subagents.some((subagent) => subagent.isRunning)),
      skill: skillCall?.name ?? null,
      since: sinceOf(pending, mainLastLineAt ?? session.startedAt),
    },
    question: ask.question,
    questionCount: ask.count,
    queuedPrompts: queue.shown,
    subagents,
  };
}

// The tool calls of the last assistant message that have no result: the calls in progress. An older call without
// result belongs to an interrupted turn.
function pendingCalls(blocks: ToolBlocks): ToolUseBlock[] {
  const messageId = blocks.lastAssistantMessageId;
  if (messageId === null) return [];
  return blocks.calls.filter((call) => call.messageId === messageId && !blocks.results.has(call.toolUseId));
}

// A Skill call returns at once while the skill keeps running: it is not a step.
function lastStep(pending: ToolUseBlock[]): ToolUseBlock | undefined {
  return pending.filter((call) => call.name !== SKILL_TOOL).at(-1);
}

function readActivityKind(pending: ToolUseBlock[], hasRunningSubagent: boolean): ActivityKind {
  const step = lastStep(pending);
  if (step === undefined) return hasRunningSubagent ? { kind: "subagents" } : { kind: "thinking" };
  if (!AGENT_TOOLS.has(step.name)) return { kind: "tool", toolName: step.name };
  const agent = agentInputSchema.safeParse(step.input);
  return {
    kind: "agent",
    agentType: (agent.success ? agent.data.subagent_type : undefined) ?? DEFAULT_AGENT_TYPE,
    description: shortenText((agent.success ? agent.data.description : undefined) ?? ""),
  };
}

function sinceOf(pending: ToolUseBlock[], fallback: Date): Date {
  return lastStep(pending)?.calledAt ?? fallback;
}

function readQuestion(pending: ToolUseBlock[]): { question: string | null; count: number } {
  const call = pending.filter((candidate) => candidate.name === ASK_TOOL).at(-1);
  const input = call === undefined ? null : askInputSchema.safeParse(call.input);
  const first = input?.success ? input.data.questions[0] : undefined;
  if (input === null || !input.success || first === undefined) return { question: null, count: 0 };
  return { question: shortenText(first.question), count: input.data.questions.length };
}

function latestTimestamp(lines: ParsedLine[]): Date | null {
  let latest: Date | null = null;
  for (const line of lines) {
    if (line.timestamp === undefined) continue;
    const time = new Date(line.timestamp);
    if (latest === null || time > latest) latest = time;
  }
  return latest;
}

// A queue content is a string, or blocks whose text blocks are the text; anything else is a content-less item.
function contentText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts = content.flatMap((block: unknown) => {
    const text = textBlockSchema.safeParse(block);
    return text.success ? [text.data.text] : [];
  });
  return texts.length === 0 ? null : texts.join("\n");
}

// The queue as the log tells it: enqueue appends, dequeue drops the oldest, remove drops the first item with the same
// content. A remove that matches nothing is ignored: Claude Code also removes messages it absorbed mid-turn.
function replayQueue(lines: ParsedLine[]): { shown: string[]; enqueuedTexts: string[] } {
  const queue: (string | null)[] = [];
  const enqueuedTexts: string[] = [];
  for (const line of lines) {
    const operation = queueSchema.safeParse(line);
    if (!operation.success) continue;
    const text = contentText(operation.data.content);
    if (operation.data.operation === "enqueue") {
      queue.push(text);
      if (text !== null) enqueuedTexts.push(text);
    } else if (operation.data.operation === "dequeue") {
      queue.shift();
    } else if (operation.data.operation === "remove" && text !== null) {
      const index = queue.indexOf(text);
      if (index >= 0) queue.splice(index, 1);
    }
  }
  const shown = queue.flatMap((text) => {
    const trimmed = text?.trim() ?? "";
    return trimmed === "" || isInjectedText(trimmed) || TAG_START.test(trimmed) ? [] : [shortenText(trimmed)];
  });
  return { shown, enqueuedTexts };
}

// The agents a <task-notification> names: a background subagent is notified when it ends, whatever the status. The
// block is in a queue content or in a user line of any origin.
function readNotifiedAgentIds(lines: ParsedLine[], queuedTexts: string[]): Set<string> {
  const texts = [...queuedTexts];
  for (const line of lines) {
    const user = userTextSchema.safeParse(line);
    if (!user.success) continue;
    const { content } = user.data.message;
    if (typeof content === "string") texts.push(content);
    else texts.push(...content.flatMap((block) => (block.type === "text" && block.text !== undefined ? [block.text] : [])));
  }
  const agentIds = new Set<string>();
  for (const text of texts) {
    for (const notification of text.match(NOTIFICATION) ?? []) {
      const agentId = TASK_ID.exec(notification)?.[1];
      if (agentId !== undefined) agentIds.add(agentId);
    }
  }
  return agentIds;
}

function readSubagents({
  session,
  files,
  mainBlocks,
  subagentBlocks,
  notifiedAgentIds,
}: {
  session: ParsedSession;
  files: SubagentFile[];
  mainBlocks: ToolBlocks;
  subagentBlocks: ToolBlocks[];
  notifiedAgentIds: Set<string>;
}): LiveSubagent[] {
  // The results of every file, a later one replacing an earlier one.
  const results = new Map<string, ToolResultInfo>();
  for (const file of [mainBlocks, ...subagentBlocks]) for (const [id, result] of file.results) results.set(id, result);
  const finishedCallIds = new Set<string>();
  const finishedAgentIds = new Set<string>();
  for (const [id, result] of results) {
    if (result.resultStatus === BACKGROUND_STATUS) continue;
    finishedCallIds.add(id);
    if (result.agentId !== null) finishedAgentIds.add(result.agentId);
  }

  return session.subagents
    .filter((subagent) => !subagent.isLogMissing)
    .map((subagent): LiveSubagent => {
      const index = files.findIndex((file) => file.agentId === subagent.agentId);
      const own = index < 0 ? undefined : subagentBlocks[index];
      const isFinished =
        (subagent.launchToolUseId !== null && finishedCallIds.has(subagent.launchToolUseId)) ||
        finishedAgentIds.has(subagent.agentId) ||
        notifiedAgentIds.has(subagent.agentId);
      return {
        agentId: subagent.agentId,
        agentType: subagent.agentType,
        description: shortenText(subagent.description),
        launchedAt: subagent.launchedAt,
        isRunning: !isFinished,
        currentTool: own === undefined ? null : (lastStep(pendingCalls(own))?.name ?? null),
      };
    });
}
