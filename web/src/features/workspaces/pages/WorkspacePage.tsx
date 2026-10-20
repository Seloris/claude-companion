import { Link, useParams } from "react-router";
import { ApiError } from "../../../api/client.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { useReopenAction } from "../data/useReopenAction.ts";
import { useWorkspaceQuery } from "../data/useWorkspaceQuery.ts";
import { SessionList } from "../ui/SessionList.tsx";
import styles from "./pages.module.css";

function WorkspacePage() {
  const workspaceId = Number(useParams().workspaceId);
  const workspaceQuery = useWorkspaceQuery(workspaceId);
  const reopenActionOf = useReopenAction();

  function renderContent() {
    if (workspaceQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    if (workspaceQuery.isError) {
      const { error } = workspaceQuery;
      const isNotFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
      return (
        <ErrorMessage>
          {isNotFound ? t("workspace.state.notFound") : t("common.state.error", { message: error.message })}
        </ErrorMessage>
      );
    }
    const workspace = workspaceQuery.data;
    return (
      <>
        <header className={styles.header}>
          <PageTitle>{workspace.name}</PageTitle>
          <p className={styles.subtitle}>{workspace.path}</p>
          <Link className={styles.back} to={`/dashboard?workspace=${workspace.id}`}>
            {t("workspace.page.dashboard")}
          </Link>
        </header>
        {workspace.sessions.length === 0 ? (
          <EmptyState>{t("workspace.sessions.empty")}</EmptyState>
        ) : (
          <SessionList sessions={workspace.sessions} reopenActionOf={reopenActionOf} />
        )}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>
        <Link className={styles.back} to="/">
          {t("workspace.page.back")}
        </Link>
        {renderContent()}
      </Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { WorkspacePage as Component };
