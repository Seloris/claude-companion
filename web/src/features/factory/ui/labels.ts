import { formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryBoard, FactoryFeatureState, FactoryRun } from "../data/factoryTypes.ts";

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

// A label of the step a run works on, not a state: the title of the feature's row with that step, else a fallback.
export function stepTitle(board: FactoryBoard, run: FactoryRun): string {
  const row = board.features.find((feature) => feature.slug === run.feature)?.steps.find((s) => s.step === run.step);
  if (row !== undefined) return row.title;
  if (run.step === "spec") return t("factory.step.spec");
  if (run.step === "plan") return t("factory.step.plan");
  if (run.step === "review") return t("factory.step.review");
  const stage = /^stage:(\d+)$/.exec(run.step);
  return stage?.[1] === undefined ? run.step : t("factory.step.stage", { number: stage[1] });
}

export function stepLabel(board: FactoryBoard, run: FactoryRun): string {
  const title = stepTitle(board, run);
  return run.command === "autopilot" ? t("factory.run.autopilotStep", { step: title }) : title;
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
