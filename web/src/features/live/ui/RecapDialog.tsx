import { Link } from "react-router";
import type { components } from "../../../api/schema.d.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Dialog } from "../../../shared/ui/Dialog.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import type { ReopenAction } from "../../workspaces/data/useReopenAction.ts";
import { ReopenActions } from "../../workspaces/ui/ReopenActions.tsx";
import { SessionRecap } from "../../workspaces/ui/SessionRecap.tsx";
import styles from "./RecapDialog.module.css";

type SessionDetail = components["schemas"]["SessionDetail"];

export type RecapDialogState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; session: SessionDetail; reopenAction: ReopenAction };

// FR-42: a stored session's recap over the live board. FR-43: the links to its full page, its workspace and the
// dashboard. FR-47: full screen on a phone (the Dialog's own rule).
export function RecapDialog({ state, onClose }: { state: RecapDialogState; onClose(): void }) {
  const title = state.kind === "loaded" ? state.session.title : t("live.recap.title");
  return (
    <Dialog
      title={title}
      closeLabel={t("live.recap.close")}
      actions={state.kind === "loaded" && <ReopenActions action={state.reopenAction} title={state.session.title} />}
      onClose={onClose}
    >
      {renderBody(state)}
    </Dialog>
  );
}

function renderBody(state: RecapDialogState) {
  switch (state.kind) {
    case "loading":
      return <LoadingState>{t("common.state.loading")}</LoadingState>;
    case "notFound":
      return <ErrorMessage>{t("session.state.notFound")}</ErrorMessage>;
    case "error":
      return <ErrorMessage>{t("common.state.error", { message: state.message })}</ErrorMessage>;
    case "loaded": {
      const { session } = state;
      return (
        <>
          <nav className={styles.links}>
            <Link className={styles.link} to={`/sessions/${session.id}`}>
              {t("live.recap.fullPage")}
            </Link>
            <Link className={styles.link} to={`/workspaces/${session.workspace.id}`}>
              {t("session.page.back", { workspace: session.workspace.name })}
            </Link>
            <Link className={styles.link} to={`/dashboard?workspace=${session.workspace.id}`}>
              {t("session.page.dashboard", { workspace: session.workspace.name })}
            </Link>
          </nav>
          <SessionRecap session={session} />
        </>
      );
    }
  }
}
