import { formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { Closable } from "../../../shared/lib/useClosedMarks.ts";
import type {
  FactoryActivity,
  FactoryActivityPhase,
  FactoryBoard,
  FactoryFeatureState,
  FactoryPhase,
  FactoryRun,
} from "../data/factoryTypes.ts";

// The Clôturée marks made on the live page (BR-04), read once per page and passed down to the Activité.
export interface FactoryClosedMarks {
  isClosed: (session: Closable) => boolean;
}

export function phaseLabel(phase: FactoryActivityPhase): string {
  return t(`factory.phase.${phase}`);
}

// FR-24: the phase to show on a run. The mod carries a turn's phase over through later status changes, so the status
// wins while a turn runs or once it is interrupted (a reading of the contract, the mod's `runPhase`; not a derived state, BR-02).
export function shownPhase(run: FactoryRun): FactoryPhase | null {
  if (run.status === "running") return "working";
  if (run.status === "interrupted") return "interrupted";
  return run.phase;
}

// FR-24: the phase label, else the status label for an older export or run.
export function runStateLabel(run: FactoryRun): string {
  const phase = shownPhase(run);
  return phase === null ? runStatusLabel(run.status) : phaseLabel(phase);
}

// A phase that is not over: on a stale board it is suffixed "au dernier scan".
export function isUnderwayPhase(phase: FactoryActivityPhase): boolean {
  return phase === "working" || phase === "awaiting-commit" || phase === "awaiting-answer";
}

export function isUnderway(run: FactoryRun): boolean {
  const phase = shownPhase(run);
  return phase === null ? run.status === "running" || run.status === "waiting" : isUnderwayPhase(phase);
}

// Null when the activity has no session: there is nothing to close.
export function toClosableActivity(activity: FactoryActivity): Closable | null {
  if (activity.sessionId === null) return null;
  return { sessionId: activity.sessionId, turnEndedAt: activity.phase === "working" ? null : activity.since };
}

export function stateLabel(state: FactoryFeatureState): string {
  return t(`factory.state.${state}`);
}

export function runStatusLabel(status: FactoryRun["status"]): string {
  return t(`factory.run.status.${status}`);
}

// The mod's grouping order of the cards.
export const STATE_ORDER: FactoryFeatureState[] = ["running", "review", "plan", "spec", "empty", "done"];

// The order of the filter chips: the lifecycle of a feature.
export const FILTER_ORDER: FactoryFeatureState[] = ["empty", "spec", "plan", "running", "review", "done"];

export const STATE_COLOR: Record<FactoryFeatureState, string> = {
  running: "var(--factory-state-running)",
  review: "var(--factory-state-review)",
  plan: "var(--factory-state-plan)",
  spec: "var(--factory-state-spec)",
  empty: "var(--factory-state-empty)",
  done: "var(--factory-state-done)",
};

// FR-29: the plan folders compare with slashes normalised and no trailing one; a null folder matches nothing.
export function samePlanFolder(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return normalizeFolder(a) === normalizeFolder(b);
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/\/+$/, "");
}

// FR-30: the plan's name, the folder's last segment without its `{date}-{time}-` prefix; null when the run has no folder.
export function planName(folder: string | null): string | null {
  if (folder === null) return null;
  const segment = normalizeFolder(folder).split("/").pop() ?? "";
  return segment.replace(/^\d{8}-\d{6}-/, "");
}

// A step label followed by the run's plan name, when it has one.
export function withPlanName(label: string, folder: string | null): string {
  const name = planName(folder);
  return name === null || name === "" ? label : `${label} · ${name}`;
}

// FR-29, BR-02: the label of the step a run works on. The timeline rows belong to the plan the board follows, so a stage
// title is used only for a run of that plan; a run of another plan of the feature never reads a stage title of the followed one.
export function runStepLabel(board: FactoryBoard, run: Pick<FactoryRun, "feature" | "folder" | "command" | "step">): string {
  if (run.step === "spec") return t("factory.step.spec");
  if (run.step === "review") return t("factory.step.review");
  if (run.step === "plan") return run.command === "review" ? t("factory.step.planReview") : t("factory.step.plan");
  const stage = /^stage:(\d+)$/.exec(run.step);
  if (stage?.[1] === undefined) return run.step;
  const feature = board.features.find((f) => f.slug === run.feature);
  if (feature !== undefined && feature.plan !== null && samePlanFolder(run.folder, feature.plan.folder)) {
    const row = feature.steps.find((s) => s.step === run.step);
    if (row !== undefined) return row.title;
  }
  return t("factory.step.stage", { number: stage[1] });
}

export function stepLabel(board: FactoryBoard, run: FactoryRun): string {
  const title = runStepLabel(board, run);
  return run.command === "autopilot" ? t("factory.run.autopilotStep", { step: title }) : title;
}

export function isNewerRun(candidate: FactoryRun, best: FactoryRun): boolean {
  return new Date(candidate.updatedAt).getTime() > new Date(best.updatedAt).getTime();
}

// The main-loop run wins over a subagent's, then the latest change.
export function isBetterRun(candidate: FactoryRun, best: FactoryRun): boolean {
  if ((candidate.agentId === null) !== (best.agentId === null)) return candidate.agentId === null;
  return isNewerRun(candidate, best);
}

// FR-29, FR-30: the run an activity comes from, among the board's live runs then its sessions: same session, feature and step.
export function findSessionRun(
  board: FactoryBoard,
  target: { sessionId: string; feature: string | null; step: string },
): FactoryRun | null {
  const matches = (run: FactoryRun) =>
    run.sessionId === target.sessionId && run.feature === target.feature && run.step === target.step;
  for (const runs of [board.live, board.sessions]) {
    let best: FactoryRun | null = null;
    for (const run of runs) if (matches(run) && (best === null || isBetterRun(run, best))) best = run;
    if (best !== null) return best;
  }
  return null;
}

// FR-12, FR-15: a run in progress counts from its status's start up to now, or up to the last scan on a frozen board;
// a run that is over lasts from its start to its last change.
export function runDuration(run: FactoryRun, board: FactoryBoard, now: Date): string {
  const updatedAt = new Date(run.updatedAt).getTime();
  if (run.status === "done" || run.status === "interrupted") {
    return formatDuration(Math.max(0, updatedAt - new Date(run.since).getTime()));
  }
  const end = board.isStale ? new Date(board.scannedAt).getTime() : now.getTime();
  return formatDuration(Math.max(0, end - updatedAt));
}

// The id of a card's element, so that a live run can scroll to it.
export function cardId(root: string, slug: string): string {
  return `factory-card:${root}:${slug}`;
}
