import { useSearchParams } from "react-router";
import { formatTokens } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { Switch } from "../../../shared/ui/Switch.tsx";
import { useRefreshStatusQuery } from "../../refresh/data/useRefreshStatusQuery.ts";
import { useStartRefreshMutation } from "../../refresh/data/useStartRefreshMutation.ts";
import { RefreshBar } from "../../refresh/ui/RefreshBar.tsx";
import { useWorkspacesQuery } from "../data/useWorkspacesQuery.ts";
import { WorkspaceList } from "../ui/WorkspaceList.tsx";
import styles from "./pages.module.css";

function WorkspacesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const includeScratch = searchParams.get("scratch") === "1";
  const workspacesQuery = useWorkspacesQuery({ includeScratch });
  const statusQuery = useRefreshStatusQuery();
  const startRefresh = useStartRefreshMutation();

  const status = statusQuery.data;
  const logsDir = status?.logsDir ?? "";

  function renderList() {
    if (workspacesQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    if (workspacesQuery.isError) {
      return <ErrorMessage>{t("common.state.error", { message: workspacesQuery.error.message })}</ErrorMessage>;
    }
    const { workspaces, totals } = workspacesQuery.data;
    if (workspaces.length === 0) {
      // The empty state names the logs folder: it waits for the status that carries it.
      if (statusQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
      if (statusQuery.isError) {
        return <ErrorMessage>{t("common.state.error", { message: statusQuery.error.message })}</ErrorMessage>;
      }
      if (status?.isRunning) return <LoadingState>{t("workspaces.empty.reading", { logsDir })}</LoadingState>;
      const isLogsDirMissing = status?.lastReport?.isLogsDirFound === false;
      return (
        <EmptyState>
          {t(isLogsDirMissing ? "workspaces.empty.notFound" : "workspaces.empty.noSession", { logsDir })}
        </EmptyState>
      );
    }
    return (
      <>
        <p className={styles.totals}>
          {t("workspaces.totals.summary", {
            sessions: tp("workspaces.sessions.count", totals.sessionCount),
            tokens: t("tokens.count.label", { count: formatTokens(totals.tokens.input + totals.tokens.output) }),
          })}
        </p>
        <WorkspaceList workspaces={workspaces} />
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>
        <PageTitle>{t("workspaces.page.title")}</PageTitle>
        <RefreshBar
          status={status}
          isStarting={startRefresh.isPending}
          startError={startRefresh.isError ? startRefresh.error.message : null}
          onRefresh={() => startRefresh.mutate()}
        />
        <section className={styles.section}>
          <div className={styles.toolbar}>
            <Switch
              label={t("workspaces.scratch.toggle")}
              checked={includeScratch}
              onChange={(checked) => setSearchParams(checked ? { scratch: "1" } : {}, { replace: true })}
            />
          </div>
          {renderList()}
        </section>
      </Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { WorkspacesPage as Component };
