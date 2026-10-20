import { useState } from "react";
import { t } from "../../../shared/lib/i18n/index.ts";
import { useClosedMarks } from "../../../shared/lib/useClosedMarks.ts";
import { useNow } from "../../../shared/lib/useNow.ts";
import { Banner } from "../../../shared/ui/Banner.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { useFactoryView } from "../data/factoryView.ts";
import { useFactoryStateQuery } from "../data/useFactoryStateQuery.ts";
import { FactoryWorkspaceGroup } from "../ui/FactoryWorkspaceGroup.tsx";
import styles from "./FactoryPage.module.css";

function FactoryPage() {
  const query = useFactoryStateQuery();
  const view = useFactoryView();
  // BR-04: the Clôturée marks made on the live page, read once for the page (a mark made in another tab arrives through the storage event); the Activité honours them.
  const closedMarks = useClosedMarks();
  // The scan age and the durations keep ticking between two polls.
  const now = useNow(1000);
  // The two switches are page state, off by default, shared by all the cards of the page (FR-18).
  const [isReview, setReview] = useState(false);
  const [isBrowser, setBrowser] = useState(false);

  function renderContent() {
    if (query.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    if (query.isError) return <ErrorMessage>{t("common.state.error", { message: query.error.message })}</ErrorMessage>;
    const { workspaces, unsupportedFiles, boardsDir, isBoardsDirReadable } = query.data;
    return (
      <>
        {unsupportedFiles.map((file) => (
          <Banner key={file.fileName}>
            {t("factory.page.unsupported", {
              fileName: file.fileName,
              version: file.schemaVersion === null ? t("common.value.none") : file.schemaVersion,
            })}
          </Banner>
        ))}
        {!isBoardsDirReadable || workspaces.length === 0 ? (
          <EmptyState>
            {t(isBoardsDirReadable ? "factory.page.empty" : "factory.page.missingDir", { boardsDir })}
          </EmptyState>
        ) : (
          workspaces.map((workspace) => (
            <FactoryWorkspaceGroup
              key={workspace.key}
              workspace={workspace}
              now={now}
              view={view}
              closedMarks={closedMarks}
              isReview={isReview}
              isBrowser={isBrowser}
              onReviewChange={setReview}
              onBrowserChange={setBrowser}
            />
          ))
        )}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>
        <PageTitle>{t("factory.page.title")}</PageTitle>
        {renderContent()}
      </Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { FactoryPage as Component };
