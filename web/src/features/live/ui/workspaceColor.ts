import type { BoardWorkspace } from "./board.ts";

const WORKSPACE_COLOR_COUNT = 8;

// FR-02: the colour of a workspace stays the same, from a hash of its key; the Scratch group takes the muted text colour.
export function workspaceColorVar(workspace: BoardWorkspace): string {
  if (workspace.isScratch) return "var(--text-muted)";
  let hash = 0;
  for (const char of workspace.key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return `var(--workspace-${(hash % WORKSPACE_COLOR_COUNT) + 1})`;
}
