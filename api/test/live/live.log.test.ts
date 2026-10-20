import { describe, expect, it } from "vitest";
import { readLiveLog, shortenText } from "../../src/features/live/live.log.js";
import {
  SESSION_ID,
  askUserQuestionBlock,
  assistantLine,
  commandLine,
  queueLine,
  taskNotificationText,
  toLines,
  toolUseBlock,
  userLine,
  type LogLine,
} from "../ingestion/log-builders.js";
import { answerLine, at, callLine, promptLine, restartLine } from "./live-builders.js";

type Subagent = { agentId: string; lines: (LogLine | string)[]; meta?: unknown };

const date = (second: number) => new Date(at(second));

function read(main: (LogLine | string)[], subagents: Subagent[] = []) {
  return readLiveLog({
    sessionId: SESSION_ID,
    mainLines: toLines(main),
    subagentFiles: subagents.map((subagent) => ({
      agentId: subagent.agentId,
      lines: toLines(subagent.lines),
      meta: subagent.meta ?? null,
    })),
  });
}

function live(main: (LogLine | string)[], subagents: Subagent[] = []) {
  const log = read(main, subagents);
  if (log === null) throw new Error("expected a live log");
  return log;
}

describe("readLiveLog", () => {
  it("returns null when the log has no working directory yet", () => {
    // Arrange
    const lines = [userLine("Go", { cwd: "" })];

    // Act
    const log = read(lines);

    // Assert
    expect(log).toBeNull();
  });

  it("reads the session's title, branch, origin and start like the stored history does", () => {
    // Arrange
    const lines = [userLine("Fix the login page", { timestamp: at(0), gitBranch: "feat/login", entrypoint: "claude-desktop" })];

    // Act
    const log = live(lines);

    // Assert
    expect(log).toMatchObject({
      firstCwd: "C:\\WS\\demo",
      title: "Fix the login page",
      isTitleFallback: false,
      gitBranch: "feat/login",
      origin: "claude-desktop",
      startedAt: date(0),
    });
  });

  describe("current activity", () => {
    it("names the tool of the call that has no result yet", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", { command: "npm test" }, 5)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({ kind: "tool", toolName: "Bash", skill: null, since: date(5) });
    });

    it("takes the last pending call of the last assistant message", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        assistantLine("m1", "claude-opus-5-5", {}, {
          timestamp: at(5),
          content: [toolUseBlock("toolu_1", "Read"), toolUseBlock("toolu_2", "Grep")],
        }),
        answerLine("toolu_2", 6),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toMatchObject({ kind: "tool", toolName: "Read", since: date(5) });
    });

    it("names the agent launched, with its type and description", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_1", "Agent", { subagent_type: "factory:reviewer", description: "Review the stage" }, 5),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({
        kind: "agent",
        agentType: "factory:reviewer",
        description: "Review the stage",
        skill: null,
        since: date(5),
      });
    });

    it("gives an agent call without a type the default type, under its older name Task too", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Task", { description: "Look around" }, 5)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toMatchObject({ kind: "agent", agentType: "general-purpose", description: "Look around" });
    });

    it("is thinking, since the last line, when every call has its result", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5), answerLine("toolu_1", 9)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({ kind: "thinking", skill: null, since: date(9) });
      expect(log.lastLineAt).toEqual(date(9));
    });

    it("is waiting on the subagents when the turn ended while a background agent runs", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_1", "Agent", { subagent_type: "Explore", description: "Search" }, 5),
        answerLine("toolu_1", 6, { status: "async_launched", agentId: "a1" }),
        assistantLine("m2", "claude-opus-5-5", {}, { timestamp: at(8) }),
      ];
      const subagent = { agentId: "a1", meta: { agentType: "Explore", toolUseId: "toolu_1" }, lines: [promptLine("Search", 6)] };

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.activity).toEqual({ kind: "subagents", skill: null, since: date(8) });
    });

    it("dates the wait on the subagents from the main log, not from the subagents' own lines", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_1", "Agent", { subagent_type: "Explore", description: "Search" }, 5),
        answerLine("toolu_1", 6, { status: "async_launched", agentId: "a1" }),
        assistantLine("m2", "claude-opus-5-5", {}, { timestamp: at(8) }),
      ];
      const subagent = {
        agentId: "a1",
        meta: { agentType: "Explore", toolUseId: "toolu_1" },
        lines: [promptLine("Search", 6), callLine("s1", "toolu_s1", "Grep", {}, 40)],
      };

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.activity).toEqual({ kind: "subagents", skill: null, since: date(8) });
      expect(log.lastLineAt).toEqual(date(40));
    });

    it("dates thinking from the main log, not from a subagent's lines", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_1", "Agent", { subagent_type: "Explore", description: "Search" }, 5),
        answerLine("toolu_1", 20, { status: "completed", agentId: "a1" }),
      ];
      const subagent = { agentId: "a1", meta: { toolUseId: "toolu_1" }, lines: [promptLine("Search", 6), callLine("s1", "toolu_s1", "Grep", {}, 40)] };

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.activity).toEqual({ kind: "thinking", skill: null, since: date(20) });
    });

    it("does not take a call without result of an earlier message for pending", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_old", "Read", {}, 5),
        callLine("m2", "toolu_2", "Bash", {}, 8),
        answerLine("toolu_2", 9),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity.kind).toBe("thinking");
    });

    it("does not take an interrupted call for pending after a later prompt and a text-only reply", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_old", "Read", {}, 5),
        promptLine("Stop, do this instead", 7),
        assistantLine("m2", "claude-opus-5-5", {}, { timestamp: at(9) }),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({ kind: "thinking", skill: null, since: date(9) });
    });

    it("does not take a pending Skill call for a step of its own", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Skill", { skill: "factory:review" }, 5)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({ kind: "thinking", skill: "factory:review", since: date(5) });
    });

    it("keeps the skill a Skill tool call started since the last prompt as the context of the step", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        callLine("m1", "toolu_1", "Skill", { skill: "factory:implement" }, 5),
        answerLine("toolu_1", 6),
        callLine("m2", "toolu_2", "Bash", {}, 8),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toEqual({ kind: "tool", toolName: "Bash", skill: "factory:implement", since: date(8) });
    });

    it("keeps the skill the person typed as the last prompt", () => {
      // Arrange
      const lines = [commandLine("/factory:implement", "plan.md", { timestamp: at(0) })];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity).toMatchObject({ kind: "thinking", skill: "factory:implement" });
    });

    it("clears the skill when a later prompt follows it", () => {
      // Arrange
      const lines = [
        commandLine("/factory:implement", undefined, { timestamp: at(0) }),
        callLine("m1", "toolu_1", "Skill", { skill: "factory:review" }, 3),
        answerLine("toolu_1", 4),
        promptLine("Thanks, now something else", 6),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.activity.skill).toBeNull();
    });

    it("does not take the skill of a subagent for the session's", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Agent", { subagent_type: "Plan", description: "Plan" }, 3)];
      const subagent = {
        agentId: "a1",
        meta: { agentType: "Plan", toolUseId: "toolu_1" },
        lines: [callLine("s1", "toolu_s1", "Skill", { skill: "factory:write-plan" }, 4)],
      };

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.activity.skill).toBeNull();
    });
  });

  describe("question", () => {
    it("reads the first question of the pending AskUserQuestion call and counts them", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        assistantLine("m1", "claude-opus-5-5", {}, {
          timestamp: at(5),
          content: [askUserQuestionBlock("toolu_1", ["Which database?", "Which port?"])],
        }),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log).toMatchObject({ question: "Which database?", questionCount: 2 });
    });

    it("has no question once the call has its answer", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(5), content: [askUserQuestionBlock("toolu_1", ["Which?"])] }),
        answerLine("toolu_1", 6),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log).toMatchObject({ question: null, questionCount: 0 });
    });

    it("has no question when another tool is pending", () => {
      // Arrange
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Bash", {}, 5)];

      // Act
      const log = live(lines);

      // Assert
      expect(log).toMatchObject({ question: null, questionCount: 0 });
    });
  });

  describe("queued prompts", () => {
    function queued(...operations: LogLine[]) {
      return live([promptLine("Go", 0), ...operations]).queuedPrompts;
    }

    it("replays enqueue and dequeue first in, first out", () => {
      // Act
      const prompts = queued(queueLine("enqueue", "first"), queueLine("enqueue", "second"), queueLine("dequeue"));

      // Assert
      expect(prompts).toEqual(["second"]);
    });

    it("drops the first item with the same content on a remove", () => {
      // Act
      const prompts = queued(
        queueLine("enqueue", "a"),
        queueLine("enqueue", "b"),
        queueLine("enqueue", "b"),
        queueLine("remove", "b"),
      );

      // Assert
      expect(prompts).toEqual(["a", "b"]);
    });

    it("ignores a remove that matches nothing", () => {
      // Act
      const prompts = queued(queueLine("enqueue", "a"), queueLine("remove", "never queued"), queueLine("remove"));

      // Assert
      expect(prompts).toEqual(["a"]);
    });

    it("holds the slot of an enqueue without content and never shows it", () => {
      // Act
      const prompts = queued(queueLine("enqueue"), queueLine("enqueue", "second"), queueLine("dequeue"));

      // Assert
      expect(prompts).toEqual(["second"]);
    });

    it("reads the text blocks of a content made of blocks", () => {
      // Act
      const prompts = queued(
        queueLine("enqueue", [{ type: "text", text: "from blocks" }, { type: "image", source: {} }]),
        queueLine("enqueue", [{ type: "image", source: {} }]),
        queueLine("enqueue", 42),
      );

      // Assert
      expect(prompts).toEqual(["from blocks"]);
    });

    it("hides what Claude Code wrote itself", () => {
      // Act
      const prompts = queued(
        queueLine("enqueue", taskNotificationText(["a1"], "completed")),
        queueLine("enqueue", '<cross-session-message from="other">Hello</cross-session-message>'),
        queueLine("enqueue", "<agent-message from=\"x\">Done</agent-message>"),
        queueLine("enqueue", "<system-reminder>Remember</system-reminder>"),
        queueLine("enqueue", "   "),
        queueLine("enqueue", "Do the dishes"),
      );

      // Assert
      expect(prompts).toEqual(["Do the dishes"]);
    });
  });

  describe("subagents", () => {
    const launch = (second = 3) =>
      callLine("m1", "toolu_agent", "Agent", { subagent_type: "Explore", description: "Find the parser" }, second);
    const explorer = (lines: (LogLine | string)[] = [promptLine("Find", 4)]): Subagent => ({
      agentId: "a1",
      meta: { agentType: "Explore", description: "Find the parser", toolUseId: "toolu_agent" },
      lines,
    });

    it("lists a foreground subagent as running until its call has a result", () => {
      // Arrange
      const running = live([promptLine("Go", 0), launch()], [explorer()]);
      const finished = live(
        [promptLine("Go", 0), launch(), answerLine("toolu_agent", 9, { status: "completed", agentId: "a1" })],
        [explorer()],
      );

      // Assert
      expect(running.subagents).toEqual([
        {
          agentId: "a1",
          agentType: "Explore",
          description: "Find the parser",
          launchedAt: date(3),
          isRunning: true,
          currentTool: null,
        },
      ]);
      expect(finished.subagents[0]?.isRunning).toBe(false);
    });

    it("ends a foreground subagent whose call has a result that names no agent", () => {
      // Arrange
      const lines = [promptLine("Go", 0), launch(), answerLine("toolu_agent", 9)];

      // Act
      const log = live(lines, [explorer()]);

      // Assert
      expect(log.subagents[0]).toMatchObject({ agentId: "a1", isRunning: false });
    });

    it("lists a background subagent as running until a task notification in the queue names it", () => {
      // Arrange
      const launched = [promptLine("Go", 0), launch(), answerLine("toolu_agent", 4, { status: "async_launched", agentId: "a1" })];

      // Act
      const running = live(launched, [explorer()]);
      const notified = live([...launched, queueLine("enqueue", taskNotificationText(["a1"], "completed"))], [explorer()]);

      // Assert
      expect(running.subagents[0]?.isRunning).toBe(true);
      expect(notified.subagents[0]?.isRunning).toBe(false);
    });

    it("lists a background subagent as running until a task notification in a user line names it", () => {
      // Arrange
      const launched = [promptLine("Go", 0), launch(), answerLine("toolu_agent", 4, { status: "async_launched", agentId: "a1" })];
      const notification = userLine(taskNotificationText(["a2", "a1"], "killed"), {
        timestamp: at(20),
        extra: { origin: { kind: "task-notification" }, isMeta: true },
      });

      // Act
      const log = live([...launched, notification], [explorer()]);

      // Assert
      expect(log.subagents[0]?.isRunning).toBe(false);
    });

    it("ends a subagent whose agent id any result names with a status other than async_launched", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        launch(),
        answerLine("toolu_agent", 4, { status: "async_launched", agentId: "a1" }),
        answerLine("toolu_other", 9, { status: "completed", agentId: "a1" }),
      ];

      // Act
      const log = live(lines, [explorer()]);

      // Assert
      expect(log.subagents[0]?.isRunning).toBe(false);
    });

    it("links a nested subagent to the call made in another subagent's file", () => {
      // Arrange
      const parent: Subagent = {
        agentId: "a1",
        meta: { agentType: "Explore", description: "Parent", toolUseId: "toolu_agent" },
        lines: [
          promptLine("Find", 4),
          callLine("s1", "toolu_child", "Agent", { subagent_type: "runner", description: "Nested" }, 5),
          answerLine("toolu_child", 12, { status: "completed", agentId: "a2" }),
        ],
      };
      const child: Subagent = { agentId: "a2", meta: { agentType: "runner", toolUseId: "toolu_child" }, lines: [promptLine("Run", 6)] };

      // Act
      const log = live([promptLine("Go", 0), launch()], [parent, child]);

      // Assert
      expect(log.subagents.map((subagent) => [subagent.agentId, subagent.description, subagent.isRunning])).toEqual([
        ["a1", "Parent", true],
        ["a2", "Nested", false],
      ]);
    });

    it("gives the tool a subagent is calling now, and none when it is thinking", () => {
      // Arrange
      const calling = explorer([promptLine("Find", 4), callLine("s1", "toolu_s1", "Grep", {}, 5)]);
      const thinking = explorer([promptLine("Find", 4), callLine("s1", "toolu_s1", "Grep", {}, 5), answerLine("toolu_s1", 6)]);

      // Act
      const withTool = live([promptLine("Go", 0), launch()], [calling]);
      const withoutTool = live([promptLine("Go", 0), launch()], [thinking]);

      // Assert
      expect(withTool.subagents[0]?.currentTool).toBe("Grep");
      expect(withoutTool.subagents[0]?.currentTool).toBeNull();
    });

    it("leaves out an agent call that no log file answers", () => {
      // Act
      const log = live([promptLine("Go", 0), launch()]);

      // Assert
      expect(log.subagents).toEqual([]);
    });
  });

  describe("turn", () => {
    const text = (messageId: string, content: string, second: number, model = "claude-opus-5-5") =>
      assistantLine(messageId, model, {}, { timestamp: at(second), content: [{ type: "text", text: content }] });

    it("dates the turn from the last prompt", () => {
      // Arrange
      const lines = [promptLine("First", 0), text("m1", "Done", 3), promptLine("Second", 20)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.turnStartedAt).toEqual(date(20));
    });

    it("has no turn before the first prompt", () => {
      // Act
      const log = live([userLine("<system-reminder>Context</system-reminder>", { timestamp: at(0) })]);

      // Assert
      expect(log.turnStartedAt).toBeNull();
      expect(log.lastReply).toBeNull();
    });

    it("takes the last text Claude wrote since the last prompt for the last reply", () => {
      // Arrange
      const lines = [
        promptLine("First", 0),
        text("m1", "Old answer", 3),
        promptLine("Second", 20),
        text("m2", "Looking into it", 22),
        callLine("m3", "toolu_1", "Bash", { command: "npm test" }, 24),
        answerLine("toolu_1", 26),
        text("m4", "All tests pass", 28),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBe("All tests pass");
    });

    it("joins the text blocks of the last reply's lines that share its message id", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        text("m1", "Other message", 2),
        text("m2", "First paragraph.", 4),
        callLine("m2", "toolu_1", "Bash", { command: "ls" }, 5),
        text("m2", "Second\n\nparagraph.", 6),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBe("First paragraph. Second paragraph.");
    });

    it("has no last reply when the turn wrote no text", () => {
      // Arrange
      const lines = [
        promptLine("First", 0),
        text("m1", "Answer of the previous turn", 3),
        promptLine("Second", 20),
        callLine("m2", "toolu_1", "Bash", { command: "npm test" }, 22),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBeNull();
      expect(log.turnStartedAt).toEqual(date(20));
    });

    it("does not take a subagent's text for the last reply", () => {
      // Arrange
      const subagent = { agentId: "a1", lines: [promptLine("Plan", 21), text("s1", "The subagent's report", 25)] };
      const lines = [promptLine("Go", 20), callLine("m1", "toolu_1", "Agent", { subagent_type: "Plan", description: "Plan it" }, 21)];

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.lastReply).toBeNull();
    });

    it("skips Claude Code's synthetic messages for the last reply", () => {
      // Arrange
      const lines = [promptLine("Go", 0), text("m1", "The real answer", 3), text("m2", "No response requested.", 5, "<synthetic>")];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBe("The real answer");
    });

    it("counts a copied line once for the last reply", () => {
      // Arrange
      const reply = { ...text("m1", "All done", 3), uuid: "u1" };
      const lines = [promptLine("Go", 0), reply, reply];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBe("All done");
    });

    it("has no last reply when the turn wrote blank text only", () => {
      // Arrange
      const lines = [promptLine("Go", 0), text("m1", "  ", 3)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBeNull();
    });

    it("starts the turn at a background task's notification that restarted Claude", () => {
      // Arrange
      const lines = [
        promptLine("Run the build in the background", 0),
        text("m1", "Started", 3),
        restartLine("task-notification", taskNotificationText(["b1"], "completed"), 60),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.turnStartedAt).toEqual(date(60));
      expect(log.lastPrompt).toBe("Run the build in the background");
    });

    it("starts the turn at a message from another session that restarted Claude", () => {
      // Arrange
      const lines = [
        promptLine("Start a side session", 0),
        text("m1", "Started", 3),
        restartLine("peer", "Another Claude session sent a message: done", 60),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.turnStartedAt).toEqual(date(60));
    });

    it("does not start a turn at a notification only recorded in the transcript", () => {
      // Arrange
      const lines = [
        promptLine("Go", 0),
        text("m1", "Done", 3),
        restartLine("task-notification", taskNotificationText(["b1"], "completed"), 60, { isTranscriptOnly: true }),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.turnStartedAt).toEqual(date(0));
    });

    it("takes the last reply from the turn a notification restarted", () => {
      // Arrange
      const lines = [
        promptLine("Run the build in the background", 0),
        text("m1", "Started", 3),
        restartLine("task-notification", taskNotificationText(["b1"], "completed"), 60),
        text("m2", "The build passed", 62),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBe("The build passed");
    });

    it("has no last reply when the turn a notification restarted wrote no text", () => {
      // Arrange
      const lines = [
        promptLine("Run the build in the background", 0),
        text("m1", "Started", 3),
        restartLine("task-notification", taskNotificationText(["b1"], "completed"), 60),
        callLine("m2", "toolu_1", "Bash", { command: "cat build.log" }, 62),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply).toBeNull();
    });

    it("keeps the latest start when an older restart line comes after the last prompt", () => {
      // Arrange
      const copied = restartLine("task-notification", taskNotificationText(["b1"], "completed"), 10);
      const lines = [promptLine("Go", 0), copied, promptLine("Next", 30), copied];

      // Act
      const log = live(lines);

      // Assert
      expect(log.turnStartedAt).toEqual(date(30));
    });

    it("caps the last reply at 300 characters", () => {
      // Arrange
      const lines = [promptLine("Go", 0), text("m1", "word ".repeat(120), 3)];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastReply?.length).toBeLessThanOrEqual(301);
      expect(log.lastReply?.endsWith("…")).toBe(true);
    });
  });

  describe("texts", () => {
    it("takes the last prompt of the person, not a meta line", () => {
      // Arrange
      const lines = [
        promptLine("First", 0),
        promptLine("Second", 4),
        userLine("Injected by a hook", { timestamp: at(6), extra: { isMeta: true } }),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastPrompt).toBe("Second");
    });

    it("has no last prompt before the person typed one", () => {
      // Act
      const log = live([userLine("<system-reminder>Context</system-reminder>", { timestamp: at(0) })]);

      // Assert
      expect(log.lastPrompt).toBeNull();
    });

    it("caps the long texts at 300 characters and collapses their whitespace", () => {
      // Arrange
      const long = "word ".repeat(120);
      const lines = [
        promptLine(`Line one\n\n   line   two ${long}`, 0),
        assistantLine("m1", "claude-opus-5-5", {}, { timestamp: at(5), content: [askUserQuestionBlock("toolu_1", [long])] }),
        queueLine("enqueue", long),
      ];

      // Act
      const log = live(lines);

      // Assert
      expect(log.lastPrompt).toMatch(/^Line one line two word word/);
      for (const text of [log.lastPrompt, log.question, log.queuedPrompts[0]]) {
        expect(text?.length).toBeLessThanOrEqual(301);
        expect(text?.endsWith("…")).toBe(true);
      }
    });

    it("caps the description of an agent and of a subagent", () => {
      // Arrange
      const description = "x".repeat(400);
      const lines = [promptLine("Go", 0), callLine("m1", "toolu_1", "Agent", { subagent_type: "Plan", description }, 3)];
      const subagent = { agentId: "a1", meta: { agentType: "Plan", description, toolUseId: "toolu_1" }, lines: [promptLine("Plan", 4)] };

      // Act
      const log = live(lines, [subagent]);

      // Assert
      expect(log.activity).toMatchObject({ kind: "agent", description: `${"x".repeat(300)}…` });
      expect(log.subagents[0]?.description).toBe(`${"x".repeat(300)}…`);
    });

    it("leaves a short text as it is", () => {
      // Act
      const text = shortenText("  Fix the   login ");

      // Assert
      expect(text).toBe("Fix the login");
    });
  });
});
