import { Link, useParams } from "react-router";
import { ApiError } from "../../../api/client.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { useSessionQuery } from "../data/useSessionQuery.ts";
import { ActivityTimeline } from "../ui/ActivityTimeline.tsx";
import { SessionFacts } from "../ui/SessionFacts.tsx";
import { SubagentTable } from "../ui/SubagentTable.tsx";
import { TokenTable } from "../ui/TokenTable.tsx";
import { ToolTable } from "../ui/ToolTable.tsx";
import styles from "./pages.module.css";

function SessionPage() {
  const sessionId = useParams().sessionId ?? "";
  const sessionQuery = useSessionQuery(sessionId);

  function renderContent() {
    if (sessionQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    if (sessionQuery.isError) {
      const { error } = sessionQuery;
      return (
        <>
          <Link className={styles.back} to="/">
            {t("workspace.page.back")}
          </Link>
          <ErrorMessage>
            {error instanceof ApiError && error.status === 404
              ? t("session.state.notFound")
              : t("common.state.error", { message: error.message })}
          </ErrorMessage>
        </>
      );
    }
    const session = sessionQuery.data;
    return (
      <>
        <header className={styles.header}>
          <span className={styles.links}>
            <Link className={styles.back} to={`/workspaces/${session.workspace.id}`}>
              {t("session.page.back", { workspace: session.workspace.name })}
            </Link>
            <Link className={styles.back} to={`/dashboard?workspace=${session.workspace.id}`}>
              {t("session.page.dashboard", { workspace: session.workspace.name })}
            </Link>
          </span>
          <PageTitle>{session.title}</PageTitle>
        </header>
        <SessionFacts session={session} />
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("session.usages.title")}</h2>
          <TokenTable usages={session.usages} />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("session.activity.title")}</h2>
          <ActivityTimeline activity={session.activity} />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("session.subagents.title")}</h2>
          <SubagentTable subagents={session.subagents} />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("session.tools.title")}</h2>
          <ToolTable tools={session.tools} />
        </section>
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>{renderContent()}</Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { SessionPage as Component };
