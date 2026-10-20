import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExportRun, ExportSession, FactoryExportV2 } from "../../src/features/factory/factory.source.js";
import type { StatusFile } from "../../src/features/live/live.source.js";
import { buildBoardExport, buildExportFeature, buildExportRun, buildExportSession, writeBoard } from "../../test/factory/factory-builders.js";
import {
  askUserQuestionBlock,
  assistantLine,
  commandLine,
  queueLine,
  titleLine,
  toolUseBlock,
  userLine,
  writeSession,
  type LogLine,
  type SubagentLog,
} from "../../test/ingestion/log-builders.js";
import { statusFile, writeStatusFile } from "../../test/live/live-builders.js";

// The live demo (`npm run demo`): logs, status files and factory boards for the nine situations of the live page's
// mockups. Pure apart from the writes: no process, no timer. Every time is relative to `now`; nothing of a real log is
// copied, the shapes come from the test builders.

type ExportFeature = FactoryExportV2["features"][number];
type ExportStep = ExportFeature["steps"][number];
type Marker = ExportStep["marker"];

const MODEL = "claude-opus-5-5";
const MINUTE = 60_000;

// Outside any repository and never created: under api/fixtures/ every session would fold into claude-companion.
export function demoWorkspaceFolder(name: string): string {
  return path.join(path.parse(process.cwd()).root, "selops-live-demo", name);
}

// The log folder as Claude Code names it: every character that is not a letter or a digit becomes a dash.
function logFolderOf(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

const COMPANION = demoWorkspaceFolder("claude-companion");
const FACTORY = demoWorkspaceFolder("factory");
const BILLING = demoWorkspaceFolder("billing-app");

export const FRESH_BOARD_FILE = "selops-live-demo-claude-companion.json";
export const FROZEN_BOARD_FILE = "selops-live-demo-billing-app.json";
const FRESH_SCAN_AGE_MS = 5_000;
const FROZEN_SCAN_AGE_MS = 2 * MINUTE;

type Origin = "desktop" | "cli";

interface DemoSession {
  sessionId: string;
  situation: string;
  title: string;
  cwd: string;
  gitBranch: string;
  origin: Origin;
  // The desktop app's id; only for a desktop session.
  hostSessionId: string | null;
  // Minutes before `now`.
  startedMin: number;
  status: "busy" | "idle" | "waiting";
  waitingFor: string | null;
  statusMin: number;
}

export const DEMO_SESSIONS: readonly DemoSession[] = [
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a61",
    situation: "At work in the workflow, with subagents",
    title: "Factory phases on the live tiles",
    cwd: COMPANION,
    gitBranch: "feat/live-sessions-phases",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556661",
    startedMin: 42,
    status: "busy",
    waitingFor: null,
    statusMin: 3,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a62",
    situation: "Commit to validate",
    title: "Drop the factory session list",
    cwd: COMPANION,
    gitBranch: "feat/factory-board-drop-session-list",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556662",
    startedMin: 48,
    status: "idle",
    waitingFor: null,
    statusMin: 12,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a63",
    situation: "Question outside the workflow",
    title: "Plugin release notes",
    cwd: FACTORY,
    gitBranch: "develop",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556663",
    startedMin: 70,
    status: "waiting",
    waitingFor: "input needed",
    statusMin: 62,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a64",
    situation: "Job done",
    title: "Step labels, api stage",
    cwd: COMPANION,
    gitBranch: "feat/live-sessions-phases",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556664",
    startedMin: 60,
    status: "idle",
    waitingFor: null,
    statusMin: 8,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a65",
    situation: "Finished outside the workflow",
    title: "Explain the stack packs",
    cwd: FACTORY,
    gitBranch: "develop",
    origin: "cli",
    hostSessionId: null,
    startedMin: 50,
    status: "idle",
    waitingFor: null,
    statusMin: 35,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a66",
    situation: "Interrupted on a frozen board",
    title: "Billing skeleton",
    cwd: BILLING,
    gitBranch: "feat/init-billing",
    origin: "cli",
    hostSessionId: null,
    startedMin: 25,
    status: "idle",
    waitingFor: null,
    statusMin: 14,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a67",
    situation: "Off-workflow run at work",
    title: "Live screen mockups",
    cwd: COMPANION,
    gitBranch: "feat/factory-board-drop-session-list",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556667",
    startedMin: 30,
    status: "busy",
    waitingFor: null,
    statusMin: 1,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a68",
    situation: "Commit to validate from the CLI",
    title: "Live labels fix",
    cwd: COMPANION,
    gitBranch: "fix/live-labels",
    origin: "cli",
    hostSessionId: null,
    startedMin: 20,
    status: "idle",
    waitingFor: null,
    statusMin: 5,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a69",
    situation: "Resumed, idle",
    title: "Marketplace layout",
    cwd: FACTORY,
    gitBranch: "develop",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556669",
    startedMin: 10,
    status: "idle",
    waitingFor: null,
    statusMin: 10,
  },
  {
    sessionId: "3f1c2a4e-5b6d-4e7f-8a9b-1c2d3e4f5a70",
    situation: "Off-workflow job done",
    title: "Board export check",
    cwd: COMPANION,
    gitBranch: "develop",
    origin: "desktop",
    hostSessionId: "local_3f1c2a4e-1111-4222-8333-444455556670",
    startedMin: 18,
    status: "idle",
    waitingFor: null,
    statusMin: 4,
  },
];

const [AT_WORK, TO_COMMIT, QUESTION, JOB_DONE, FINISHED, INTERRUPTED, OFF_WORKFLOW, CLI_COMMIT, RESUMED, OFF_WORKFLOW_DONE] =
  DEMO_SESSIONS.map((session) => session.sessionId) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

const PENDING_COMMIT = "feat(factory-board): web — drop the factory session list";
const PENDING_COMMIT_BODY = "The live page's band replaces the list.";
const CLI_PENDING_COMMIT = "fix(live-sessions): web — pill labels";

const LIVE_PHASES_PLAN = ".planning/features/live-sessions/dev-plans/20261020-090000-add-session-phases";
const DROP_LIST_PLAN = ".planning/features/factory-board/dev-plans/20261020-100000-remove-session-list";
const LIVE_LABELS_PLAN = ".planning/features/factory-board/dev-plans/20261020-110000-fix-live-labels";
const STEP_LABELS_PLAN = ".planning/features/session-activity/dev-plans/20261020-080000-add-step-labels";
const BILLING_PLAN = ".planning/features/billing/dev-plans/20261020-070000-init-billing";

// The log lines of one session, every one with its id, folder, branch and origin.
function logOf(session: DemoSession, now: number) {
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE).toISOString();
  const options = (minutesAgo: number) => ({
    sessionId: session.sessionId,
    timestamp: iso(minutesAgo),
    cwd: session.cwd,
    gitBranch: session.gitBranch,
    entrypoint: session.origin === "desktop" ? "claude-desktop" : "cli",
  });
  const prompt = (text: string, minutesAgo: number) => userLine(text, options(minutesAgo));
  const reply = (id: string, text: string, minutesAgo: number) =>
    assistantLine(id, MODEL, {}, { ...options(minutesAgo), content: [{ type: "text", text }] });
  const calls = (id: string, blocks: LogLine[], minutesAgo: number) =>
    assistantLine(id, MODEL, {}, { ...options(minutesAgo), content: blocks });
  const title = titleLine("custom", session.title, session.sessionId);
  return { prompt, reply, calls, title, options, iso };
}

function linesOf(session: DemoSession, now: number): { lines: LogLine[]; subagents?: SubagentLog[] } {
  const { prompt, reply, calls, title, options } = logOf(session, now);
  switch (session.sessionId) {
    case AT_WORK: {
      const subagentLines = (agentPrompt: string, tool: string, id: string) => [
        userLine(agentPrompt, options(3)),
        assistantLine(`${id}-m1`, MODEL, {}, { ...options(1), content: [toolUseBlock(`${id}-call`, tool, {})] }),
      ];
      return {
        lines: [
          title,
          commandLine("/factory:autopilot", "live-sessions — with review", options(41)),
          reply("at-work-m1", "Stage 1 committed, stage 2 committed. Stage 3 now.", 20),
          // The reviewer is the last call: it is the session's step.
          calls(
            "at-work-m2",
            [
              toolUseBlock("toolu_demo_runner", "Agent", { subagent_type: "factory:runner", description: "Run the api suite" }),
              toolUseBlock("toolu_demo_reviewer", "Agent", { subagent_type: "factory:reviewer", description: "Revue du stage 3" }),
            ],
            3,
          ),
        ],
        subagents: [
          {
            agentId: "demorunner01",
            meta: { agentType: "factory:runner", description: "Run the api suite", toolUseId: "toolu_demo_runner" },
            lines: subagentLines("Run the api suite", "Bash", "runner"),
          },
          {
            agentId: "demoreviewer01",
            meta: { agentType: "factory:reviewer", description: "Revue du stage 3", toolUseId: "toolu_demo_reviewer" },
            lines: subagentLines("Review stage 3", "Read", "reviewer"),
          },
        ],
      };
    }
    case TO_COMMIT:
      return {
        lines: [
          title,
          commandLine(
            "/factory:implement",
            `${DROP_LIST_PLAN}/ — stage 2 (web)`,
            options(20),
          ),
          reply("to-commit-m1", `Stage 2 is done, build and lint green. Commit?\n\n\`\`\`\n${PENDING_COMMIT}\n\n${PENDING_COMMIT_BODY}\n\`\`\``, 12),
        ],
      };
    case QUESTION:
      return {
        lines: [
          title,
          prompt("Draft the release notes of the next plugin version", 65),
          calls(
            "question-m1",
            [askUserQuestionBlock("toolu_demo_question", ["Which version number do we publish?", "Do we list the fixes?"])],
            62,
          ),
        ],
      };
    case JOB_DONE:
      return {
        lines: [
          title,
          commandLine("/factory:implement", `${STEP_LABELS_PLAN}/ — stage 1 (api)`, options(34)),
          reply("job-done-m1", "Stage 1 committed: 3a08238 feat(session-activity): api — step labels. JOB DONE.", 8),
        ],
      };
    case FINISHED:
      return {
        lines: [
          title,
          prompt("How do the stack packs reach a new project?", 41),
          reply("finished-m1", "A stack pack is copied by factory-init when the component's folder is empty, then installed and checked.", 35),
        ],
      };
    case INTERRUPTED:
      return {
        lines: [
          title,
          commandLine("/factory:implement", `${BILLING_PLAN}/ — stage 2 (web)`, options(17)),
          // A tool call with no text and no result: no last reply.
          calls("interrupted-m1", [toolUseBlock("toolu_demo_interrupted", "Bash", { command: "npm run build" })], 14),
        ],
      };
    case OFF_WORKFLOW: {
      const log = logOf(session, now);
      return {
        lines: [
          title,
          prompt("Draw the live screen mockups", 6),
          calls("off-workflow-m1", [toolUseBlock("toolu_demo_write", "Write", { file_path: "mockups/live.html" })], 1),
          queueLine("enqueue", "Then the compact mode", { sessionId: session.sessionId, timestamp: log.iso(0.5) }),
        ],
      };
    }
    case CLI_COMMIT:
      return {
        lines: [
          title,
          commandLine("/factory:implement", `${LIVE_LABELS_PLAN}/ — stage 1 (web)`, options(15)),
          reply("cli-commit-m1", `Fixed. Commit?\n\n\`\`\`\n${CLI_PENDING_COMMIT}\n\`\`\``, 5),
        ],
      };
    case RESUMED:
      // Only prompt older than the process: no turn since it was resumed.
      return {
        lines: [
          title,
          prompt("Sketch the marketplace layout", 90),
          reply("resumed-m1", "Here is a first layout.", 89),
        ],
      };
    case OFF_WORKFLOW_DONE:
      return {
        lines: [
          title,
          prompt("Check what the board exports for a free request", 18),
          reply("off-workflow-done-m1", "The export carries the phase and the recap of a free request.", 4),
        ],
      };
    default:
      throw new Error(`no log for demo session ${session.sessionId}`);
  }
}

function statusOf(session: DemoSession, pid: number, now: number): StatusFile {
  const ago = (minutes: number) => now - minutes * MINUTE;
  return statusFile({
    pid,
    sessionId: session.sessionId,
    cwd: session.cwd,
    startedAt: ago(session.startedMin),
    entrypoint: session.origin === "desktop" ? "claude-desktop" : "cli",
    ...(session.hostSessionId === null ? {} : { hostSessionId: session.hostSessionId }),
    status: session.status,
    ...(session.waitingFor === null ? {} : { waitingFor: session.waitingFor }),
    statusUpdatedAt: ago(session.statusMin),
    updatedAt: ago(session.statusMin),
  });
}

function stepsOf(stages: { title: string; marker: Marker }[]): ExportStep[] {
  return stages.map(({ title, marker }, index) => ({
    step: `stage:${index + 1}`,
    title,
    detail: marker === "done" ? "committed" : "",
    marker,
    runs: [],
  }));
}

function planOf(folder: string, title: string, stages: { title: string; marker: Marker }[]): NonNullable<ExportFeature["plan"]> {
  return {
    folder,
    title,
    stages: stages.map((stage, index) => ({
      number: index + 1,
      title: stage.title,
      commit: null,
      sha: stage.marker === "done" ? `${index + 1}a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b` : null,
      done: stage.marker === "done" ? 4 : stage.marker === "running" ? 2 : 0,
      total: 4,
    })),
    validationDone: 0,
    validationTotal: 4,
    reviewDone: false,
    isDraft: false,
  };
}

function freshBoardOf(now: number): FactoryExportV2 {
  const ago = (minutes: number) => now - minutes * MINUTE;
  const liveStages: { title: string; marker: Marker }[] = [
    { title: "Stage 1 · api", marker: "done" },
    { title: "Stage 2 · web", marker: "done" },
    { title: "Stage 3 · mod", marker: "running" },
    { title: "Stage 4 · docs", marker: "pending" },
  ];
  const autopilot: ExportRun = buildExportRun({
    sessionId: AT_WORK,
    feature: "live-sessions",
    folder: LIVE_PHASES_PLAN,
    command: "autopilot",
    step: "stage:3",
    status: "running",
    phase: "working",
    since: ago(41),
    updatedAt: ago(3),
  });
  const toCommit: ExportRun = buildExportRun({
    sessionId: TO_COMMIT,
    feature: "factory-board",
    folder: DROP_LIST_PLAN,
    command: "implement",
    step: "stage:2",
    status: "waiting",
    phase: "awaiting-commit",
    pendingCommit: `${PENDING_COMMIT}\n\n${PENDING_COMMIT_BODY}`,
    since: ago(20),
    updatedAt: ago(12),
  });
  const offWorkflow: ExportRun = buildExportRun({
    sessionId: OFF_WORKFLOW,
    feature: null,
    folder: null,
    command: "off-workflow",
    step: "off-workflow",
    status: "running",
    phase: "working",
    since: ago(6),
    updatedAt: ago(1),
  });
  // Live-sessions FR-34: a free request whose job is done keeps its phase and recap on the live page.
  const offWorkflowDone: ExportRun = buildExportRun({
    sessionId: OFF_WORKFLOW_DONE,
    feature: null,
    folder: null,
    command: "off-workflow",
    step: "off-workflow",
    status: "done",
    phase: "job-done",
    recap: { text: "The board export of a free request is checked.", commits: [] },
    since: ago(18),
    updatedAt: ago(4),
  });
  const cliCommit: ExportRun = buildExportRun({
    sessionId: CLI_COMMIT,
    feature: "factory-board",
    folder: LIVE_LABELS_PLAN,
    command: "implement",
    step: "stage:1",
    status: "waiting",
    phase: "awaiting-commit",
    pendingCommit: CLI_PENDING_COMMIT,
    since: ago(15),
    updatedAt: ago(5),
  });
  const jobDone: ExportSession = buildExportSession({
    sessionId: JOB_DONE,
    feature: "session-activity",
    folder: STEP_LABELS_PLAN,
    command: "implement",
    step: "stage:1",
    status: "done",
    phase: "job-done",
    recap: {
      text: "The api serves the step labels of every run.",
      commits: [{ sha: "3a08238c4d5e6f708192a3b4c5d6e7f809a1b2c3", subject: "feat(session-activity): api — step labels" }],
    },
    since: ago(34),
    updatedAt: ago(8),
  });
  const dropListStages: { title: string; marker: Marker }[] = [
    { title: "Stage 1 · api", marker: "done" },
    { title: "Stage 2 · web", marker: "running" },
  ];
  const stepLabelStages: { title: string; marker: Marker }[] = [
    { title: "Stage 1 · api", marker: "done" },
    { title: "Stage 2 · web", marker: "pending" },
  ];
  return buildBoardExport({
    scannedAt: now - FRESH_SCAN_AGE_MS,
    root: COMPANION,
    branch: "feat/live-sessions-phases",
    live: [autopilot, toCommit, offWorkflow, cliCommit, offWorkflowDone],
    sessions: [jobDone],
    features: [
      buildExportFeature({
        slug: "live-sessions",
        title: "Live sessions",
        state: "running",
        plan: planOf(LIVE_PHASES_PLAN, "Session phases", liveStages),
        plans: [LIVE_PHASES_PLAN],
        autopilot,
        steps: stepsOf(liveStages),
      }),
      buildExportFeature({
        slug: "factory-board",
        title: "Factory board",
        state: "running",
        plan: planOf(DROP_LIST_PLAN, "Drop the session list", dropListStages),
        plans: [DROP_LIST_PLAN, LIVE_LABELS_PLAN],
        steps: stepsOf(dropListStages),
      }),
      buildExportFeature({
        slug: "session-activity",
        title: "Session activity",
        state: "running",
        plan: planOf(STEP_LABELS_PLAN, "Step labels", stepLabelStages),
        plans: [STEP_LABELS_PLAN],
        next: {
          label: "Stage 2 · web",
          prompt: `/factory:implement ${STEP_LABELS_PLAN}/ — stage 2 (web)`,
        },
        steps: stepsOf(stepLabelStages),
      }),
    ],
  });
}

function frozenBoardOf(now: number): FactoryExportV2 {
  const ago = (minutes: number) => now - minutes * MINUTE;
  const stages: { title: string; marker: Marker }[] = [
    { title: "Stage 1 · api", marker: "done" },
    { title: "Stage 2 · web", marker: "running" },
    { title: "Stage 3 · docs", marker: "pending" },
  ];
  return buildBoardExport({
    scannedAt: now - FROZEN_SCAN_AGE_MS,
    root: BILLING,
    branch: "feat/init-billing",
    live: [],
    sessions: [
      buildExportSession({
        sessionId: INTERRUPTED,
        feature: "billing",
        folder: BILLING_PLAN,
        command: "implement",
        step: "stage:2",
        status: "interrupted",
        phase: "interrupted",
        since: ago(17),
        updatedAt: ago(14),
      }),
    ],
    features: [
      buildExportFeature({
        slug: "billing",
        title: "Billing",
        state: "running",
        plan: planOf(BILLING_PLAN, "Billing skeleton", stages),
        plans: [BILLING_PLAN],
        steps: stepsOf(stages),
      }),
    ],
  });
}

export async function writeLiveDemo({
  projectsDir,
  sessionsDir,
  boardsDir,
  now,
  pids,
}: {
  projectsDir: string;
  sessionsDir: string;
  boardsDir: string;
  now: number;
  pids: number[];
}): Promise<void> {
  if (pids.length !== DEMO_SESSIONS.length) throw new Error(`the demo needs ${DEMO_SESSIONS.length} pids, got ${pids.length}`);
  for (const [index, session] of DEMO_SESSIONS.entries()) {
    const pid = pids[index] as number;
    await writeStatusFile(sessionsDir, statusOf(session, pid, now));
    const { lines, subagents } = linesOf(session, now);
    await writeSession(projectsDir, logFolderOf(session.cwd), {
      sessionId: session.sessionId,
      lines,
      ...(subagents === undefined ? {} : { subagents }),
    });
  }
  await mkdir(boardsDir, { recursive: true });
  await writeBoard(boardsDir, FRESH_BOARD_FILE, freshBoardOf(now));
  await writeBoard(boardsDir, FROZEN_BOARD_FILE, frozenBoardOf(now));
}

// Keeps the fresh board fresh while the demo runs: only its scan time moves. A temp file then a rename, though the
// reader tolerates a half-written file anyway (factory-board FR-21).
export async function writeFreshBoard(boardsDir: string, now: number): Promise<void> {
  const target = path.join(boardsDir, FRESH_BOARD_FILE);
  const board = JSON.parse(await readFile(target, "utf8")) as FactoryExportV2;
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify({ ...board, scannedAt: now - FRESH_SCAN_AGE_MS }));
  await rename(temp, target);
}
