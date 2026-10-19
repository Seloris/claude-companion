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

export interface ParsedToolCall {
  toolUseId: string;
  // Null: the session itself made the call, not one of its subagents.
  agentId: string | null;
  name: string;
  mcpServer: string | null;
  calledAt: Date;
  // Null: no result came (BR-08).
  isError: boolean | null;
}

export interface ParsedSkillCall {
  name: string;
  args: string | null;
  calledAt: Date;
  isTyped: boolean;
  agentId: string | null;
  // The index in `prompts` of the prompt a typed skill call is.
  promptPosition: number | null;
}

export interface ParsedSubagent {
  agentId: string;
  agentType: string;
  model: string | null;
  description: string;
  launchedAt: Date;
  usages: ModelUsage[];
  toolCallCount: number;
  isLogMissing: boolean;
  // The id of the Agent call that launched it, null when no call is known. Not stored.
  launchToolUseId: string | null;
}

export interface SubagentFile {
  agentId: string;
  lines: string[];
  // The sibling meta.json as read, null when missing or unreadable.
  meta: unknown;
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
  toolCalls: ParsedToolCall[];
  skillCalls: ParsedSkillCall[];
  subagents: ParsedSubagent[];
  toolCallCount: number;
  failedToolCallCount: number;
  skillCallCount: number;
  agentTypes: string[];
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

const toolUseSchema = z.looseObject({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() });
const toolResultSchema = z.looseObject({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
});

const assistantBlocksSchema = z.looseObject({
  type: z.literal("assistant"),
  message: z.looseObject({ id: z.string().nullish(), content: z.array(z.looseObject({ type: z.string() })) }),
});

const userBlocksSchema = z.looseObject({
  type: z.literal("user"),
  message: z.looseObject({ content: z.array(z.looseObject({ type: z.string() })) }),
  toolUseResult: z.unknown().optional(),
});

const skillInputSchema = z.looseObject({ skill: z.string().min(1), args: z.string().optional() });
export const agentInputSchema = z.looseObject({
  subagent_type: z.string().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
});
// The result of an Agent call: the agent it started and, for a background launch, the status "async_launched".
// Each field is read on its own: a status that is not a string must not hide the agent id.
const toolUseResultSchema = z.looseObject({
  agentId: z.string().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
});
const metaSchema = z.looseObject({
  agentType: z.string().optional(),
  description: z.string().optional(),
  toolUseId: z.string().optional(),
  model: z.string().optional(),
});

export type ParsedLine = z.infer<typeof lineSchema>;

const SYNTHETIC_MODEL = "<synthetic>";
const TITLE_LENGTH = 80;
// Text blocks Claude Code injects into a user line: not something the person typed.
const INJECTED_PREFIXES = ["<system-reminder>", "<local-command-", "<task-notification>", "[Request interrupted"];
export const SKILL_TOOL = "Skill";
// Older logs name the agent tool Task.
export const AGENT_TOOLS = new Set(["Agent", "Task"]);
export const DEFAULT_AGENT_TYPE = "general-purpose";
// BR-01: Claude Code's own commands are not skills.
export const BUILT_IN_COMMANDS = new Set([
  "add-dir",
  "advisor",
  "agents",
  "bashes",
  "bug",
  "clear",
  "compact",
  "config",
  "context",
  "cost",
  "doctor",
  "effort",
  "exit",
  "export",
  "extra-usage",
  "fast",
  "feedback",
  "help",
  "hooks",
  "ide",
  "init",
  "login",
  "logout",
  "mcp",
  "memory",
  "model",
  "output-style",
  "permissions",
  "plugin",
  "pr-comments",
  "privacy-settings",
  "release-notes",
  "reload-plugins",
  "remote-control",
  "resume",
  "review",
  "rewind",
  "security-review",
  "status",
  "statusline",
  "terminal-setup",
  "theme",
  "todos",
  "upgrade",
  "usage",
  "usage-credits",
  "vim",
]);

// BR-04: `mcp__{server}__{tool}` belongs to that MCP server, any other name is a built-in tool.
export function mcpServerOf(toolName: string): string | null {
  const parts = toolName.split("__");
  const server = parts[1];
  return parts.length >= 3 && parts[0] === "mcp" && server !== undefined && server !== "" ? server : null;
}

export function parseSession(input: {
  sessionId: string;
  mainLines: string[];
  subagentFiles: SubagentFile[];
}): ParsedSession | null {
  const { sessionId } = input;
  const main = parseLogLines(input.mainLines, sessionId);
  const subagentFiles = input.subagentFiles.map((file) => parseLogLines(file.lines, sessionId));
  const mainLines = main.lines;
  const subagentLines = subagentFiles.map((file) => file.lines);
  const unreadableLines = [main, ...subagentFiles].reduce((total, file) => total + file.unreadableLines, 0);

  const firstCwd = mainLines.find((line) => line.cwd !== undefined && line.cwd !== "")?.cwd;
  if (firstCwd === undefined) return null;

  let startedAt: Date | undefined;
  let endedAt: Date | undefined;
  let gitBranch: string | null = null;
  let origin: string | null = null;
  let customTitle: string | undefined;
  let aiTitle: string | undefined;
  const prompts: ParsedPrompt[] = [];
  const commands: ParsedSkillCall[] = [];

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
    const command = toSkillCommand(line);
    if (command !== null) {
      // A typed command is always a prompt too: the one just pushed.
      const promptPosition = command.isTyped && prompt !== null ? prompts.length - 1 : null;
      commands.push({ ...command, agentId: null, promptPosition });
    }
  }

  const usages = sumUsages([mainLines, ...subagentLines].flat());
  // A main file with a cwd always has a timestamped line; the fallback only satisfies the type.
  const start = startedAt ?? new Date(0);
  const activity = readActivity(
    [
      { agentId: null, lines: mainLines },
      ...input.subagentFiles.map((file, index) => ({ agentId: file.agentId, lines: subagentLines[index] ?? [] })),
    ],
    start,
  );
  const subagents = toSubagents(input.subagentFiles, subagentLines, activity, start);
  const skillCalls = [...commands, ...activity.skillCalls].sort((a, b) => a.calledAt.getTime() - b.calledAt.getTime());

  return {
    sessionId,
    firstCwd,
    startedAt: start,
    endedAt: endedAt ?? start,
    gitBranch,
    origin,
    title: customTitle ?? aiTitle ?? titleFromPrompt(prompts[0]?.text) ?? sessionId,
    promptCount: prompts.length,
    // BR-09: a subagent whose log is missing still counts as launched.
    subagentCount: subagents.length,
    usages,
    prompts,
    toolCalls: activity.toolCalls,
    skillCalls,
    subagents,
    toolCallCount: activity.toolCalls.length,
    failedToolCallCount: activity.toolCalls.filter((call) => call.isError === true).length,
    skillCallCount: skillCalls.length,
    agentTypes: [...new Set(subagents.map((subagent) => subagent.agentType))].sort((a, b) => a.localeCompare(b)),
    unreadableLines,
  };
}

// The lines of one log file that belong to the session. Blank lines are skipped, unparsable ones counted.
export function parseLogLines(rawLines: string[], sessionId: string): { lines: ParsedLine[]; unreadableLines: number } {
  const lines: ParsedLine[] = [];
  let unreadableLines = 0;
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
  return { lines, unreadableLines };
}

// Text Claude Code injected into a user line: not something the person typed.
export function isInjectedText(text: string): boolean {
  return INJECTED_PREFIXES.some((prefix) => text.trimStart().startsWith(prefix));
}

// The line passes the filter of the person's prompts, or comes from a plugin when `isPluginAllowed`.
function readUserLine(line: ParsedLine, { isPluginAllowed }: { isPluginAllowed: boolean }) {
  const user = userSchema.safeParse(line);
  if (!user.success) return null;
  const { data } = user;
  if (data.isMeta === true || data.isSidechain === true) return null;
  if (data.isCompactSummary === true || data.isVisibleInTranscriptOnly === true) return null;
  const kind = data.origin?.kind ?? "human";
  if (kind !== "human" && !(isPluginAllowed && kind === "plugin")) return null;
  const texts =
    typeof data.message.content === "string"
      ? [data.message.content]
      : data.message.content.flatMap((block) => (block.type === "text" && block.text !== undefined ? [block.text] : []));
  return {
    isHuman: kind === "human",
    sentAt: new Date(data.timestamp),
    texts: texts.filter((text) => !isInjectedText(text)),
  };
}

function toPrompt(line: ParsedLine): ParsedPrompt | null {
  const user = readUserLine(line, { isPluginAllowed: false });
  if (user === null) return null;
  const texts = user.texts.flatMap((text) => {
    const command = toCommand(text);
    const kept = (command ?? text).trim();
    return kept === "" ? [] : [kept];
  });
  if (texts.length === 0) return null;
  return { text: texts.join("\n\n"), sentAt: user.sentAt };
}

// A command the person typed, or a plugin sent, is a skill call unless it is built-in (BR-01). The skill
// expansions Claude Code writes after a Skill tool call are meta lines: never one, the tool call already is.
function toSkillCommand(line: ParsedLine): Omit<ParsedSkillCall, "agentId" | "promptPosition"> | null {
  const user = readUserLine(line, { isPluginAllowed: true });
  if (user === null) return null;
  for (const text of user.texts) {
    // BR-02: the name as called, plugin prefix included; only the slash is dropped.
    const name = readTag(text, "command-name")?.replace(/^\//, "");
    if (name === undefined || name === "") continue;
    if (BUILT_IN_COMMANDS.has(name)) return null;
    const args = readTag(text, "command-args") ?? "";
    return { name, args: args === "" ? null : args, calledAt: user.sentAt, isTyped: user.isHuman };
  }
  return null;
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

interface AgentCall {
  toolUseId: string;
  calledAt: Date;
  subagentType: string | undefined;
  description: string | undefined;
  model: string | undefined;
}

interface Activity {
  toolCalls: ParsedToolCall[];
  skillCalls: ParsedSkillCall[];
  agentCalls: AgentCall[];
  // The agent id a tool result names, by the id of the agent call it answers.
  resultAgentIds: Map<string, string>;
}

export interface ToolUseBlock {
  toolUseId: string;
  name: string;
  input: unknown;
  messageId: string | null;
  // Null: the line has no timestamp.
  calledAt: Date | null;
}

export interface ToolResultInfo {
  isError: boolean;
  agentId: string | null;
  resultStatus: string | null;
}

export interface ToolBlocks {
  calls: ToolUseBlock[];
  results: Map<string, ToolResultInfo>;
  // The message id of the file's last assistant line, whatever its content.
  lastAssistantMessageId: string | null;
}

// The tool calls and results of one file, in log order.
export function readToolBlocks(lines: ParsedLine[]): ToolBlocks {
  const calls = new Map<string, ToolUseBlock>();
  const results = new Map<string, ToolResultInfo>();
  let lastAssistantMessageId: string | null = null;
  for (const line of lines) {
    const assistant = assistantBlocksSchema.safeParse(line);
    if (assistant.success) {
      const messageId = assistant.data.message.id ?? null;
      lastAssistantMessageId = messageId;
      for (const block of assistant.data.message.content) {
        const toolUse = toolUseSchema.safeParse(block);
        // Claude Code may write one tool call on several lines.
        if (!toolUse.success || calls.has(toolUse.data.id)) continue;
        const { id, name, input } = toolUse.data;
        calls.set(id, {
          toolUseId: id,
          name,
          input,
          messageId,
          calledAt: line.timestamp === undefined ? null : new Date(line.timestamp),
        });
      }
      continue;
    }
    const user = userBlocksSchema.safeParse(line);
    if (!user.success) continue;
    const toolUseResult = toolUseResultSchema.safeParse(user.data.toolUseResult);
    for (const block of user.data.message.content) {
      const result = toolResultSchema.safeParse(block);
      if (!result.success) continue;
      const id = result.data.tool_use_id;
      results.set(id, {
        isError: result.data.is_error === true,
        // A later result without an agent id keeps the one an earlier result of the call named.
        agentId: (toolUseResult.success ? toolUseResult.data.agentId : undefined) ?? results.get(id)?.agentId ?? null,
        resultStatus: toolUseResult.success ? (toolUseResult.data.status ?? null) : null,
      });
    }
  }
  return { calls: [...calls.values()], results, lastAssistantMessageId };
}

function readActivity(files: { agentId: string | null; lines: ParsedLine[] }[], start: Date): Activity {
  const toolCalls = new Map<string, ParsedToolCall>();
  const skillCalls: ParsedSkillCall[] = [];
  const agentCalls: AgentCall[] = [];
  const results = new Map<string, boolean>();
  const resultAgentIds = new Map<string, string>();

  for (const file of files) {
    const blocks = readToolBlocks(file.lines);
    for (const call of blocks.calls) {
      // A call seen in an earlier file wins.
      if (toolCalls.has(call.toolUseId)) continue;
      const { toolUseId: id, name, input } = call;
      const calledAt = call.calledAt ?? start;
      toolCalls.set(id, { toolUseId: id, agentId: file.agentId, name, mcpServer: mcpServerOf(name), calledAt, isError: null });
      if (name === SKILL_TOOL) {
        const skill = skillInputSchema.safeParse(input);
        if (skill.success) {
          const args = skill.data.args?.trim() ?? "";
          skillCalls.push({
            name: skill.data.skill,
            args: args === "" ? null : args,
            calledAt,
            isTyped: false,
            agentId: file.agentId,
            promptPosition: null,
          });
        }
      }
      if (AGENT_TOOLS.has(name)) {
        const agent = agentInputSchema.safeParse(input);
        agentCalls.push({
          toolUseId: id,
          calledAt,
          subagentType: agent.success ? agent.data.subagent_type : undefined,
          description: agent.success ? agent.data.description : undefined,
          model: agent.success ? agent.data.model : undefined,
        });
      }
    }
    for (const [id, result] of blocks.results) {
      results.set(id, result.isError);
      if (result.agentId !== null) resultAgentIds.set(id, result.agentId);
    }
  }

  const calls = [...toolCalls.values()].map((call) => ({ ...call, isError: results.get(call.toolUseId) ?? null }));
  return { toolCalls: calls, skillCalls, agentCalls, resultAgentIds };
}

function toSubagents(files: SubagentFile[], linesByFile: ParsedLine[][], activity: Activity, start: Date): ParsedSubagent[] {
  const callsById = new Map(activity.agentCalls.map((call) => [call.toolUseId, call]));
  const callIdByAgentId = new Map([...activity.resultAgentIds].map(([toolUseId, agentId]) => [agentId, toolUseId]));
  const linkedCallIds = new Set<string>();

  const subagents = files.map((file, index): ParsedSubagent => {
    const lines = linesByFile[index] ?? [];
    const meta = metaSchema.safeParse(file.meta);
    const { agentType, description, toolUseId, model } = meta.success ? meta.data : {};
    const callId = toolUseId !== undefined && callsById.has(toolUseId) ? toolUseId : callIdByAgentId.get(file.agentId);
    const call = callId === undefined ? undefined : callsById.get(callId);
    if (call !== undefined) linkedCallIds.add(call.toolUseId);
    const usages = sumUsages(lines);
    const firstTimestamp = lines.find((line) => line.timestamp !== undefined)?.timestamp;
    return {
      agentId: file.agentId,
      agentType: agentType ?? call?.subagentType ?? DEFAULT_AGENT_TYPE,
      model: dominantModel(usages) ?? model ?? call?.model ?? null,
      description: description ?? call?.description ?? "",
      launchedAt: call?.calledAt ?? (firstTimestamp === undefined ? start : new Date(firstTimestamp)),
      usages,
      toolCallCount: activity.toolCalls.filter((toolCall) => toolCall.agentId === file.agentId).length,
      isLogMissing: false,
      launchToolUseId: callId ?? null,
    };
  });

  // BR-09: an agent call no log file answers is still a launched subagent, with no tokens and no tool calls.
  const missing = activity.agentCalls
    .filter((call) => !linkedCallIds.has(call.toolUseId))
    .map(
      (call): ParsedSubagent => ({
        agentId: call.toolUseId,
        agentType: call.subagentType ?? DEFAULT_AGENT_TYPE,
        model: call.model ?? null,
        description: call.description ?? "",
        launchedAt: call.calledAt,
        usages: [],
        toolCallCount: 0,
        isLogMissing: true,
        launchToolUseId: call.toolUseId,
      }),
    );
  return [...subagents, ...missing].sort((a, b) => a.launchedAt.getTime() - b.launchedAt.getTime());
}

// The model a subagent ran on: the one that used the most tokens, when several did.
function dominantModel(usages: ModelUsage[]): string | null {
  let best: ModelUsage | null = null;
  for (const usage of usages) {
    if (best === null || usage.inputTokens + usage.outputTokens > best.inputTokens + best.outputTokens) best = usage;
  }
  return best?.model ?? null;
}

function sumUsages(lines: ParsedLine[]): ModelUsage[] {
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
