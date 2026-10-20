import { Link } from "react-router";
import type { FactoryWorkspace } from "../data/factoryTypes.ts";
import type { FactoryView } from "../data/factoryView.ts";
import { FactoryBoardView } from "./FactoryBoardView.tsx";
import type { FactoryClosedMarks } from "./labels.ts";
import styles from "./FactoryWorkspaceGroup.module.css";

// FR-03, FR-07: a workspace and its boards; a workspace the history does not know yet has no link.
export function FactoryWorkspaceGroup({
  workspace,
  now,
  view,
  closedMarks,
  isReview,
  isBrowser,
  onReviewChange,
  onBrowserChange,
}: {
  workspace: FactoryWorkspace;
  now: Date;
  view: FactoryView;
  closedMarks: FactoryClosedMarks;
  isReview: boolean;
  isBrowser: boolean;
  onReviewChange: (checked: boolean) => void;
  onBrowserChange: (checked: boolean) => void;
}) {
  return (
    <section className={styles.group} aria-label={workspace.name}>
      <header className={styles.header}>
        <h2 className={styles.name}>
          {workspace.workspaceId === null ? (
            workspace.name
          ) : (
            <Link className={styles.link} to={`/workspaces/${workspace.workspaceId}`}>
              {workspace.name}
            </Link>
          )}
        </h2>
        <p className={styles.path}>{workspace.path}</p>
      </header>
      {workspace.boards.map((board) => (
        <FactoryBoardView
          key={board.fileName}
          board={board}
          now={now}
          view={view}
          closedMarks={closedMarks}
          isReview={isReview}
          isBrowser={isBrowser}
          onReviewChange={onReviewChange}
          onBrowserChange={onBrowserChange}
        />
      ))}
    </section>
  );
}
