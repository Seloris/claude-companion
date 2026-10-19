import { t } from "../../../shared/lib/i18n/index.ts";

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
