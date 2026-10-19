import type { components } from "../../../api/schema.d.ts";
import { formatDuration, formatRelative } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import styles from "./RefreshBar.module.css";

type RefreshStatus = components["schemas"]["RefreshStatus"];
// The generated type is nullable: the API document marks the report as such where the status refers to it.
type RefreshReport = NonNullable<components["schemas"]["RefreshReport"]>;
type RefreshMode = components["schemas"]["RefreshMode"];

function ReportSummary({ report }: { report: RefreshReport }) {
  const shared = {
    when: formatRelative(report.finishedAt),
    added: tp("refresh.report.added", report.sessionsAdded),
    archived: tp("refresh.report.archived", report.sessionsArchived),
    unreadable: tp("refresh.report.unreadable", report.unreadableLines),
    duration: formatDuration(report.durationMs),
  };
  // FR-05: a full run says how many sessions it re-read.
  return (
    <p className={styles.report}>
      {report.mode === "full"
        ? t("refresh.report.fullSummary", { ...shared, read: tp("refresh.report.read", report.sessionsRead) })
        : t("refresh.report.summary", { ...shared, updated: tp("refresh.report.updated", report.sessionsUpdated) })}
    </p>
  );
}

export function RefreshBar({
  status,
  isStarting,
  startError,
  onRefresh,
}: {
  status: RefreshStatus | undefined;
  isStarting: boolean;
  startError: string | null;
  onRefresh(mode: RefreshMode): void;
}) {
  const isRunning = isStarting || (status?.isRunning ?? false);
  const report = status?.lastReport ?? null;
  return (
    <div className={styles.bar}>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => onRefresh("incremental")} disabled={isRunning}>
          {isRunning ? t("refresh.button.running") : t("refresh.button.start")}
        </Button>
        <Button variant="quiet" onClick={() => onRefresh("full")} disabled={isRunning} title={t("refresh.button.fullHint")}>
          {t("refresh.button.full")}
        </Button>
      </div>
      {report === null
        ? status !== undefined && <p className={styles.report}>{t("refresh.report.none")}</p>
        : report.status === "failed"
          ? <ErrorMessage>{t("refresh.report.failed", { when: formatRelative(report.finishedAt) })}</ErrorMessage>
          : !report.isLogsDirFound
            ? (
              <ErrorMessage>
                {t("refresh.report.notFound", { when: formatRelative(report.finishedAt), logsDir: status?.logsDir ?? "" })}
              </ErrorMessage>
            )
            : <ReportSummary report={report} />}
      {startError !== null && <ErrorMessage>{t("refresh.start.failed", { message: startError })}</ErrorMessage>}
    </div>
  );
}
