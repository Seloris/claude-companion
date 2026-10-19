import { useNow } from "../../../shared/lib/useNow.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { useLiveStateQuery } from "../data/useLiveStateQuery.ts";
import { LiveWorkspaceSection } from "../ui/LiveWorkspaceSection.tsx";
import styles from "./LivePage.module.css";

// The "since" labels and durations show seconds, so they tick every second, between two polls.
const NOW_TICK_MS = 1000;

function LivePage() {
  const liveQuery = useLiveStateQuery({ isPolling: false });
  const now = useNow(NOW_TICK_MS);

  function renderContent() {
    if (liveQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    // A failed poll replaces the sessions: the page never keeps showing a state it can no longer read (FR-12).
    if (liveQuery.isError) {
      return <ErrorMessage>{t("common.state.error", { message: liveQuery.error.message })}</ErrorMessage>;
    }
    const live = liveQuery.data;
    if (!live.isSessionsDirReadable) {
      return <ErrorMessage>{t("live.state.unreadable", { dir: live.sessionsDir })}</ErrorMessage>;
    }
    if (live.workspaces.length === 0) return <EmptyState>{t("live.state.empty")}</EmptyState>;
    return (
      <>
        <p className={styles.counts}>
          {[
            tp("live.counts.running", live.counts.running),
            tp("live.counts.awaiting", live.counts.awaitingAnswer),
            tp("live.counts.idle", live.counts.idle),
          ].join(" · ")}
        </p>
        <div className={styles.workspaces}>
          {live.workspaces.map((workspace) => (
            <LiveWorkspaceSection key={workspace.key} workspace={workspace} now={now} />
          ))}
        </div>
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>
        <PageTitle>{t("live.page.title")}</PageTitle>
        {renderContent()}
      </Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { LivePage as Component };
