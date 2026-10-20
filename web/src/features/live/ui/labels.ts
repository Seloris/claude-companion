import type { components } from "../../../api/schema.d.ts";
import { formatDateTime, formatDuration, formatTime } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { BoardSession, PillId } from "./board.ts";

// The origins Claude Code reports, mapped to their label; any other value is shown as it comes.
const ORIGIN_KEYS: Record<string, string> = {
  cli: "live.origin.cli",
  "claude-desktop": "live.origin.claudeDesktop",
  "claude-vscode": "live.origin.claudeVscode",
  print: "live.origin.print",
};

export function originLabel(origin: string): string {
  const key = ORIGIN_KEYS[origin];
  return key === undefined ? origin : t(key);
}

// What a session waits for when it did not ask a question the page can show.
const WAITING_FOR_KEYS: Record<string, string> = {
  "input needed": "live.waiting.inputNeeded",
  "dialog open": "live.waiting.dialogOpen",
  "goal proposal": "live.waiting.goalProposal",
};

export function waitingForLabel(waitingFor: string | null): string {
  const key = waitingFor === null ? undefined : WAITING_FOR_KEYS[waitingFor];
  return t(key ?? "live.waiting.other");
}

// FR-32: the label of a tile's pill, its factory phase or its live status.
export function pillLabel(pill: PillId): string {
  return t(`live.pill.${pill}`);
}

export type CurrentActivity = NonNullable<components["schemas"]["CurrentActivity"]>;

export function activityLabel(activity: CurrentActivity): string {
  switch (activity.kind) {
    case "tool":
      return t("live.activity.tool", { name: activity.toolName });
    case "agent":
      return t("live.activity.agent", { type: activity.agentType, description: activity.description });
    case "subagents":
      return t("live.activity.subagents");
    case "thinking":
      return t("live.activity.thinking");
  }
}

// A start on another day shows its date: a time alone would be ambiguous.
export function startLabel(iso: string, now: Date): string {
  return new Date(iso).toDateString() === now.toDateString() ? formatTime(iso) : formatDateTime(iso);
}

// The duration of the session's latest turn, from its start to the moment it became idle.
export function turnDuration(session: BoardSession): string {
  const turnMs =
    session.turnStartedAt === null
      ? 0
      : Math.max(0, new Date(session.statusSince).getTime() - new Date(session.turnStartedAt).getTime());
  return formatDuration(turnMs);
}
