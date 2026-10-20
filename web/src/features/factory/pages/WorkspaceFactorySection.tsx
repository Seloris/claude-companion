import { useState } from "react";
import { t } from "../../../shared/lib/i18n/index.ts";
import { useNow } from "../../../shared/lib/useNow.ts";
import { useFactoryView } from "../data/factoryView.ts";
import { useFactoryStateQuery } from "../data/useFactoryStateQuery.ts";
import { FactoryBoardView } from "../ui/FactoryBoardView.tsx";
import styles from "./WorkspaceFactorySection.module.css";

// FR-08: the factory section of a workspace's page. It holds its own poll and clock, so that the page's history does not
// redraw every second, and it shows nothing while loading, on error or without a board: the history is never blocked.
export function WorkspaceFactorySection({ workspaceId }: { workspaceId: number }) {
  const query = useFactoryStateQuery();
  const view = useFactoryView();
  const now = useNow(1000);
  const [isReview, setReview] = useState(false);
  const [isBrowser, setBrowser] = useState(false);

  const group = query.data?.workspaces.find((workspace) => workspace.workspaceId === workspaceId);
  if (group === undefined || group.boards.length === 0) return null;
  return (
    <section className={styles.section} aria-label={t("factory.section.title")}>
      <h2 className={styles.title}>{t("factory.section.title")}</h2>
      {group.boards.map((board) => (
        <FactoryBoardView
          key={board.fileName}
          board={board}
          now={now}
          view={view}
          isReview={isReview}
          isBrowser={isBrowser}
          onReviewChange={setReview}
          onBrowserChange={setBrowser}
        />
      ))}
    </section>
  );
}
