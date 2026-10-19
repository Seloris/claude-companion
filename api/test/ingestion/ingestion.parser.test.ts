import { describe, expect, it } from "vitest";
import { parseSession } from "../../src/features/ingestion/ingestion.parser.js";
import {
  SESSION_ID,
  assistantLine,
  commandLine,
  titleLine,
  toLines,
  userLine,
  type LogLine,
} from "./log-builders.js";

function parse(main: (LogLine | string)[], subagents: (LogLine | string)[][] = []) {
  return parseSession({ sessionId: SESSION_ID, mainLines: toLines(main), subagentFiles: subagents.map(toLines) });
}

function parsed(main: (LogLine | string)[], subagents: (LogLine | string)[][] = []) {
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
});
