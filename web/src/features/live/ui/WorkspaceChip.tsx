import type { CSSProperties } from "react";
import type { BoardWorkspace } from "./board.ts";
import styles from "./WorkspaceChip.module.css";
import { workspaceColorVar } from "./workspaceColor.ts";

// The first letters of the first two words of a name: "claude-companion" is "CC", "factory" is "F".
function initials(name: string): string {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// FR-02: the workspace's square, in its colour, with its initials.
export function WorkspaceSquare({ workspace }: { workspace: BoardWorkspace }) {
  return (
    <span className={styles.square} style={{ "--workspace-color": workspaceColorVar(workspace) } as CSSProperties} aria-hidden="true">
      {initials(workspace.name)}
    </span>
  );
}

// FR-02: the workspace's square and its name.
export function WorkspaceChip({ workspace }: { workspace: BoardWorkspace }) {
  return (
    <span className={styles.chip}>
      <WorkspaceSquare workspace={workspace} />
      <span className={styles.name}>{workspace.name}</span>
    </span>
  );
}
