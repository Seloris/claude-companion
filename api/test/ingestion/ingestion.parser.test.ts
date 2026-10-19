import { describe, expect, it } from "vitest";
import { mcpServerOf, parseSession } from "../../src/features/ingestion/ingestion.parser.js";
import {
  SESSION_ID,
  assistantLine,
  commandLine,
  titleLine,
  toLines,
  toolResultBlock,
  toolUseBlock,
  userLine,
  type LogLine,
} from "./log-builders.js";

type Subagent = (LogLine | string)[] | { agentId: string; lines: (LogLine | string)[]; meta?: unknown };

function parse(main: (LogLine | string)[], subagents: Subagent[] = []) {
  return parseSession({
    sessionId: SESSION_ID,
    mainLines: toLines(main),
    subagentFiles: subagents.map((subagent, index) =>
      Array.isArray(subagent)
        ? { agentId: `a${index}`, lines: toLines(subagent), meta: null }
        : { agentId: subagent.agentId, lines: toLines(subagent.lines), meta: subagent.meta ?? null },
    ),
  });
}

function parsed(main: (LogLine | string)[], subagents: Subagent[] = []) {
  const session = parse(main, subagents);
  if (session === null) throw new Error("expected a parsed session");
  return session;
}

describe("parseSession", () => {
  describe("title", () => {
    it("takes the last custom title over the generated one", () => {
      // Arrange
      const lines = [
        userLine("Hello"),
        titleLine("custom", "First name"),
        titleLine("ai", "Generated"),
        titleLine("custom", "Renamed"),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.title).toBe("Renamed");
    });

    it("takes the last generated title when there is no custom one", () => {
      // Arrange
      const lines = [userLine("Hello"), titleLine("ai", "Old"), titleLine("ai", "Generated")];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.title).toBe("Generated");
    });

    it("cuts the first prompt to 80 characters with an ellipsis when there is no title", () => {
      // Arrange
      const prompt = "a".repeat(100);

      // Act
      const session = parsed([userLine(prompt), userLine("second")]);

      // Assert
      expect(session.title).toBe(`${"a".repeat(80)}…`);
    });

    it("keeps a short first prompt whole", () => {
      // Act
      const session = parsed([userLine("Fix the login")]);

      // Assert
      expect(session.title).toBe("Fix the login");
    });

    it("falls back to the session id when there is no title and no prompt", () => {
      // Act
      const session = parsed([assistantLine("msg_1", "claude-opus-5-5", { output: 1 })]);

      // Assert
      expect(session.title).toBe(SESSION_ID);
    });
  });

  describe("token usage", () => {
    it("counts each message once across the main and subagent files", () => {
      // Arrange
      const usage = { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 };
      const main = [
        userLine("Go"),
        assistantLine("msg_1", "claude-opus-5-5", usage),
        assistantLine("msg_1", "claude-opus-5-5", usage),
        assistantLine("msg_2", "claude-opus-5-5", { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }),
      ];
      const subagent = [
        assistantLine("msg_3", "claude-haiku-5-5", { input: 5, output: 6 }),
        assistantLine("msg_3", "claude-haiku-5-5", { input: 5, output: 6 }),
        assistantLine("msg_1", "claude-opus-5-5", usage),
      ];

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.usages).toEqual([
        { model: "claude-haiku-5-5", inputTokens: 5, outputTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { model: "claude-opus-5-5", inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44 },
      ]);
      expect(session.subagentCount).toBe(1);
    });

    it("keeps the largest counters of a message whose lines carry growing usage", () => {
      // Arrange
      const main = [
        userLine("Go"),
        assistantLine("msg_1", "claude-opus-5-5", { input: 10, output: 5 }),
        assistantLine("msg_1", "claude-opus-5-5", { input: 10, output: 120 }),
      ];

      // Act
      const session = parsed(main);

      // Assert
      expect(session.usages).toEqual([
        { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ]);
    });

    it("skips the synthetic model", () => {
      // Act
      const session = parsed([userLine("Go"), assistantLine("msg_1", "<synthetic>", { output: 9 })]);

      // Assert
      expect(session.usages).toEqual([]);
    });

    it("ignores the lines of another session copied into the file", () => {
      // Arrange
      const lines = [
        userLine("Old prompt", { sessionId: "other-session", timestamp: "2026-09-01T10:00:00.000Z" }),
        assistantLine("msg_old", "claude-opus-5-5", { output: 100 }, { sessionId: "other-session" }),
        userLine("New prompt", { timestamp: "2026-10-01T10:00:00.000Z" }),
        assistantLine("msg_new", "claude-opus-5-5", { output: 1 }),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.prompts.map((prompt) => prompt.text)).toEqual(["New prompt"]);
      expect(session.usages).toEqual([
        { model: "claude-opus-5-5", inputTokens: 0, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ]);
      expect(session.startedAt).toEqual(new Date("2026-10-01T10:00:00.000Z"));
    });
  });

  describe("prompts", () => {
    it("keeps only what the person typed, in order, with its time", () => {
      // Arrange
      const lines = [
        userLine("First", { timestamp: "2026-10-01T10:00:00.000Z" }),
        userLine("Skill body", { extra: { isMeta: true } }),
        userLine("Subagent prompt", { extra: { isSidechain: true } }),
        userLine("Summary of the conversation", { extra: { isCompactSummary: true } }),
        userLine("Transcript only", { extra: { isVisibleInTranscriptOnly: true } }),
        userLine([{ type: "tool_result", tool_use_id: "toolu_1", content: "result" }]),
        userLine("From a plugin", { extra: { origin: { kind: "plugin" } } }),
        userLine("From a peer", { extra: { origin: { kind: "peer" } } }),
        userLine("Task done", { extra: { origin: { kind: "task-notification" } } }),
        userLine("No origin", { timestamp: "2026-10-01T10:05:00.000Z", extra: { origin: undefined } }),
        userLine("Second", { timestamp: "2026-10-01T10:10:00.000Z" }),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.prompts).toEqual([
        { text: "First", sentAt: new Date("2026-10-01T10:00:00.000Z") },
        { text: "No origin", sentAt: new Date("2026-10-01T10:05:00.000Z") },
        { text: "Second", sentAt: new Date("2026-10-01T10:10:00.000Z") },
      ]);
    });

    it("drops system reminders, local command output and images from a typed message", () => {
      // Arrange
      const lines = [
        userLine([
          { type: "text", text: "<system-reminder>\nContext</system-reminder>" },
          { type: "text", text: "Look at this" },
          { type: "image", source: { type: "base64", data: "AAAA" } },
          { type: "text", text: "and fix it" },
        ]),
        userLine("<local-command-stdout>done</local-command-stdout>"),
        userLine("<task-notification>finished</task-notification>"),
        userLine("[Request interrupted by user]"),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.prompts.map((prompt) => prompt.text)).toEqual(["Look at this\n\nand fix it"]);
    });

    it("formats a slash command with its arguments, whatever the tag order", () => {
      // Arrange
      const lines = [
        commandLine("/factory:implement", "  .planning/plan — stage 1  "),
        commandLine("/review", "src/app.ts", { isArgsFirst: true }),
        commandLine("/clear", undefined),
        commandLine("/compact", ""),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.prompts.map((prompt) => prompt.text)).toEqual([
        "/factory:implement .planning/plan — stage 1",
        "/review src/app.ts",
        "/clear",
        "/compact",
      ]);
      expect(session.promptCount).toBe(4);
    });
  });

  describe("unreadable lines", () => {
    it("counts the lines that are not JSON, in the main and subagent files", () => {
      // Arrange
      const main = [userLine("Go"), '{"type":"assistant","mess'];
      const subagent = ["not json", assistantLine("msg_1", "claude-opus-5-5", { output: 1 })];

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.unreadableLines).toBe(2);
    });

    it("skips lines of a type it does not use without counting them", () => {
      // Arrange
      const lines = [
        userLine("Go"),
        { type: "queue-operation", operation: "enqueue", sessionId: SESSION_ID },
        { type: "file-history-snapshot", messageId: "m1", snapshot: {} },
        { type: "assistant", sessionId: SESSION_ID, message: "not an object" },
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.unreadableLines).toBe(0);
      expect(session.prompts).toHaveLength(1);
    });
  });

  describe("session facts", () => {
    it("reads the first working directory, the time span, the last branch and the first origin", () => {
      // Arrange
      const lines = [
        titleLine("custom", "Title"),
        userLine("Go", {
          timestamp: "2026-10-01T10:00:00.000Z",
          cwd: "C:\\WS\\demo",
          gitBranch: "main",
          entrypoint: "claude-desktop",
        }),
        assistantLine("msg_1", "claude-opus-5-5", { output: 1 }, {
          timestamp: "2026-10-01T11:30:00.000Z",
          cwd: "C:\\WS\\demo\\src",
          gitBranch: "feat/login",
          entrypoint: "cli",
        }),
        userLine("Again", { timestamp: "2026-10-01T11:00:00.000Z", gitBranch: "" }),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session).toMatchObject({
        firstCwd: "C:\\WS\\demo",
        startedAt: new Date("2026-10-01T10:00:00.000Z"),
        endedAt: new Date("2026-10-01T11:30:00.000Z"),
        gitBranch: "feat/login",
        origin: "claude-desktop",
        subagentCount: 0,
      });
    });

    it("returns null when no line of the main file has a working directory", () => {
      // Act
      const session = parse([titleLine("custom", "Title"), { type: "queue-operation", sessionId: SESSION_ID }]);

      // Assert
      expect(session).toBeNull();
    });
  });

  describe("tool calls", () => {
    function toolLine(messageId: string, blocks: LogLine[], timestamp = "2026-10-01T10:01:00.000Z") {
      return assistantLine(messageId, "claude-opus-5-5", { output: 1 }, { content: blocks, timestamp });
    }

    it("records the calls of the session and of its subagents, each with who made it", () => {
      // Arrange
      const main = [userLine("Go"), toolLine("msg_1", [toolUseBlock("toolu_1", "Read")])];
      const subagent = { agentId: "a1", lines: [toolLine("msg_2", [toolUseBlock("toolu_2", "Grep")])] };

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.toolCalls).toEqual([
        {
          toolUseId: "toolu_1",
          agentId: null,
          name: "Read",
          mcpServer: null,
          calledAt: new Date("2026-10-01T10:01:00.000Z"),
          isError: null,
        },
        {
          toolUseId: "toolu_2",
          agentId: "a1",
          name: "Grep",
          mcpServer: null,
          calledAt: new Date("2026-10-01T10:01:00.000Z"),
          isError: null,
        },
      ]);
      expect(session.toolCallCount).toBe(2);
    });

    it("counts a call written on several lines once", () => {
      // Arrange
      const block = toolUseBlock("toolu_1", "Bash");
      const lines = [userLine("Go"), toolLine("msg_1", [block]), toolLine("msg_1", [block])];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.toolCalls).toHaveLength(1);
    });

    it("marks a call failed, succeeded, or neither when no result came", () => {
      // Arrange
      const lines = [
        userLine("Go"),
        toolLine("msg_1", [toolUseBlock("toolu_1", "Bash"), toolUseBlock("toolu_2", "Bash"), toolUseBlock("toolu_3", "Bash")]),
        userLine([toolResultBlock("toolu_1", true)]),
        userLine([toolResultBlock("toolu_2")]),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.toolCalls.map((call) => call.isError)).toEqual([true, false, null]);
      expect(session.failedToolCallCount).toBe(1);
    });

    it("counts the skill tool and the agent tool as tools", () => {
      // Arrange
      const lines = [
        userLine("Go"),
        toolLine("msg_1", [
          toolUseBlock("toolu_1", "Skill", { skill: "write-plan" }),
          toolUseBlock("toolu_2", "Agent", { subagent_type: "Explore", description: "Find" }),
        ]),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.toolCalls.map((call) => call.name)).toEqual(["Skill", "Agent"]);
    });

    it("names the MCP server of an MCP tool and none for a built-in tool", () => {
      // Act & Assert
      expect(mcpServerOf("mcp__Claude_Browser__computer")).toBe("Claude_Browser");
      expect(mcpServerOf("mcp__claude-in-chrome__navigate")).toBe("claude-in-chrome");
      expect(mcpServerOf("mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch")).toBe("1a59c906-04da-521d-bda7-7f71b9f9e01c");
      expect(mcpServerOf("Bash")).toBeNull();
      expect(mcpServerOf("mcp__x")).toBeNull();
    });
  });

  describe("skill calls", () => {
    it("records a skill tool call with its arguments, from the session or a subagent", () => {
      // Arrange
      const main = [
        userLine("Go"),
        assistantLine("msg_1", "claude-opus-5-5", { output: 1 }, {
          timestamp: "2026-10-01T10:01:00.000Z",
          content: [toolUseBlock("toolu_1", "Skill", { skill: "factory:write-plan", args: " session-activity " })],
        }),
      ];
      const subagent = {
        agentId: "a1",
        lines: [
          assistantLine("msg_2", "claude-opus-5-5", { output: 1 }, {
            timestamp: "2026-10-01T10:02:00.000Z",
            content: [toolUseBlock("toolu_2", "Skill", { skill: "caveman" })],
          }),
        ],
      };

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.skillCalls).toEqual([
        {
          name: "factory:write-plan",
          args: "session-activity",
          calledAt: new Date("2026-10-01T10:01:00.000Z"),
          isTyped: false,
          agentId: null,
          promptPosition: null,
        },
        {
          name: "caveman",
          args: null,
          calledAt: new Date("2026-10-01T10:02:00.000Z"),
          isTyped: false,
          agentId: "a1",
          promptPosition: null,
        },
      ]);
      expect(session.skillCallCount).toBe(2);
    });

    it("records a typed slash command as a typed skill call, named without its slash and with its plugin prefix", () => {
      // Arrange
      const lines = [
        userLine("Hello", { timestamp: "2026-10-01T10:00:00.000Z" }),
        commandLine("/factory:implement", "plan — stage 1", { timestamp: "2026-10-01T10:05:00.000Z" }),
        commandLine("write-spec", undefined, { timestamp: "2026-10-01T10:06:00.000Z" }),
      ];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.skillCalls).toEqual([
        {
          name: "factory:implement",
          args: "plan — stage 1",
          calledAt: new Date("2026-10-01T10:05:00.000Z"),
          isTyped: true,
          agentId: null,
          promptPosition: 1,
        },
        {
          name: "write-spec",
          args: null,
          calledAt: new Date("2026-10-01T10:06:00.000Z"),
          isTyped: true,
          agentId: null,
          promptPosition: 2,
        },
      ]);
      expect(session.prompts).toHaveLength(3);
    });

    it("does not count Claude Code's built-in commands as skills", () => {
      // Arrange
      const lines = [userLine("Go"), commandLine("/compact", undefined), commandLine("/model", "opus"), commandLine("/clear", undefined)];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.skillCalls).toEqual([]);
    });

    it("does not count the skill expansion Claude Code writes after a skill tool call", () => {
      // Arrange
      const expansion = commandLine("write-spec", undefined, { extra: { isMeta: true, isSidechain: true } });
      const subagent = {
        agentId: "a1",
        lines: [
          assistantLine("msg_1", "claude-opus-5-5", { output: 1 }, {
            content: [toolUseBlock("toolu_1", "Skill", { skill: "write-spec" })],
          }),
          expansion,
        ],
      };

      // Act
      const session = parsed([userLine("Go"), expansion], [subagent]);

      // Assert
      expect(session.skillCalls.map((call) => [call.name, call.agentId])).toEqual([["write-spec", "a1"]]);
    });

    it("records a command a plugin sent as a skill call not typed by the person", () => {
      // Arrange
      const lines = [userLine("Go"), commandLine("/session-debug", undefined, { extra: { origin: { kind: "plugin" } } })];

      // Act
      const session = parsed(lines);

      // Assert
      expect(session.skillCalls).toMatchObject([{ name: "session-debug", isTyped: false, promptPosition: null }]);
      expect(session.prompts).toHaveLength(1);
    });
  });

  describe("subagents", () => {
    function agentCall(id: string, input: LogLine, timestamp = "2026-10-01T10:01:00.000Z") {
      return assistantLine(`msg_${id}`, "claude-opus-5-5", { output: 1 }, {
        timestamp,
        content: [toolUseBlock(id, "Agent", input)],
      });
    }

    it("reads a subagent's type and description from its meta and its model, tokens and tool calls from its log", () => {
      // Arrange
      const main = [
        userLine("Go"),
        agentCall("toolu_agent", { subagent_type: "factory:reviewer", description: "Review", model: "opus" }),
      ];
      const subagent = {
        agentId: "a1",
        meta: { agentType: "factory:reviewer", description: "Review the stage", toolUseId: "toolu_agent" },
        lines: [
          userLine("Review it", { timestamp: "2026-10-01T10:01:05.000Z", extra: { isSidechain: true } }),
          assistantLine("msg_s1", "claude-haiku-5-5", { input: 1, output: 1 }, { content: [toolUseBlock("toolu_s1", "Read")] }),
          assistantLine("msg_s2", "claude-opus-5-5", { input: 10, output: 20, cacheRead: 3, cacheWrite: 4 }, {
            content: [toolUseBlock("toolu_s2", "Grep")],
          }),
        ],
      };

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.subagents).toEqual([
        {
          agentId: "a1",
          agentType: "factory:reviewer",
          model: "claude-opus-5-5",
          description: "Review the stage",
          launchedAt: new Date("2026-10-01T10:01:00.000Z"),
          usages: [
            { model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
            { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 4 },
          ],
          toolCallCount: 2,
          isLogMissing: false,
        },
      ]);
      expect(session.agentTypes).toEqual(["factory:reviewer"]);
      expect(session.subagentCount).toBe(1);
    });

    it("falls back to the meta's model alias when the subagent's log has no assistant line", () => {
      // Arrange
      const subagent = { agentId: "a1", meta: { agentType: "runner", model: "haiku" }, lines: [userLine("Run")] };

      // Act
      const session = parsed([userLine("Go")], [subagent]);

      // Assert
      expect(session.subagents[0]).toMatchObject({ agentType: "runner", model: "haiku", usages: [] });
    });

    it("links a nested subagent to the agent call of the subagent that launched it", () => {
      // Arrange
      const parent = {
        agentId: "a1",
        meta: { agentType: "general-purpose", toolUseId: "toolu_parent" },
        lines: [agentCall("toolu_child", { subagent_type: "runner", description: "Nested" }, "2026-10-01T10:02:00.000Z")],
      };
      const child = { agentId: "a2", meta: { agentType: "runner", toolUseId: "toolu_child" }, lines: [userLine("Run")] };
      const main = [userLine("Go"), agentCall("toolu_parent", { subagent_type: "general-purpose", description: "Parent" })];

      // Act
      const session = parsed(main, [parent, child]);

      // Assert
      expect(session.subagents.map((subagent) => [subagent.agentId, subagent.description, subagent.isLogMissing])).toEqual([
        ["a1", "Parent", false],
        ["a2", "Nested", false],
      ]);
      expect(session.subagents[1]?.launchedAt).toEqual(new Date("2026-10-01T10:02:00.000Z"));
    });

    it("links a subagent without meta to its agent call by the agent id of the call's result", () => {
      // Arrange
      const main = [
        userLine("Go"),
        agentCall("toolu_agent", { subagent_type: "Explore", description: "Find the parser" }),
        userLine([toolResultBlock("toolu_agent")], { extra: { toolUseResult: { status: "completed", agentId: "a1" } } }),
      ];
      const subagent = { agentId: "a1", lines: [userLine("Find")] };

      // Act
      const session = parsed(main, [subagent]);

      // Assert
      expect(session.subagents).toMatchObject([{ agentId: "a1", agentType: "Explore", description: "Find the parser" }]);
    });

    it("counts an agent call without a log file as a launched subagent with no tokens", () => {
      // Arrange
      const main = [
        userLine("Go"),
        agentCall("toolu_agent", { subagent_type: "Plan", description: "Plan it", model: "sonnet" }),
      ];

      // Act
      const session = parsed(main);

      // Assert
      expect(session.subagents).toEqual([
        {
          agentId: "toolu_agent",
          agentType: "Plan",
          model: "sonnet",
          description: "Plan it",
          launchedAt: new Date("2026-10-01T10:01:00.000Z"),
          usages: [],
          toolCallCount: 0,
          isLogMissing: true,
        },
      ]);
      expect(session.subagentCount).toBe(1);
    });

    it("reads the older Task name of the agent tool", () => {
      // Arrange
      const main = [
        userLine("Go"),
        assistantLine("msg_1", "claude-opus-5-5", { output: 1 }, {
          content: [toolUseBlock("toolu_task", "Task", { subagent_type: "general-purpose", description: "Old" })],
        }),
      ];

      // Act
      const session = parsed(main);

      // Assert
      expect(session.subagents).toMatchObject([{ agentType: "general-purpose", description: "Old", isLogMissing: true }]);
    });

    it("lists the distinct agent types of the session, sorted", () => {
      // Arrange
      const main = [
        userLine("Go"),
        agentCall("toolu_1", { subagent_type: "runner" }),
        agentCall("toolu_2", { subagent_type: "Explore" }),
        agentCall("toolu_3", { subagent_type: "runner" }),
      ];

      // Act
      const session = parsed(main);

      // Assert
      expect(session.agentTypes).toEqual(["Explore", "runner"]);
      expect(session.subagentCount).toBe(3);
    });
  });
});
