import type { components } from "../../../api/schema.d.ts";
import { formatDuration, formatRelative } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import styles from "./RefreshBar.module.css";

type RefreshStatus = components["schemas"]["RefreshStatus"];

export function RefreshBar({
  status,
  isStarting,
  startError,
  onRefresh,
}: {
  status: RefreshStatus | undefined;
  isStarting: boolean;
  startError: string | null;
  onRefresh(): void;
}) {
  const isRunning = isStarting || (status?.isRunning ?? false);
  const report = status?.lastReport ?? null;
  return (
    <div className={styles.bar}>
      <Button variant="primary" onClick={onRefresh} disabled={isRunning}>
        {isRunning ? t("refresh.button.running") : t("refresh.button.start")}
      </Button>
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
            : (
            <p className={styles.report}>
              {t("refresh.report.summary", {
                when: formatRelative(report.finishedAt),
                added: tp("refresh.report.added", report.sessionsAdded),
                updated: tp("refresh.report.updated", report.sessionsUpdated),
                archived: tp("refresh.report.archived", report.sessionsArchived),
                unreadable: tp("refresh.report.unreadable", report.unreadableLines),
                duration: formatDuration(report.durationMs),
              })}
            </p>
          )}
      {startError !== null && <ErrorMessage>{t("refresh.start.failed", { message: startError })}</ErrorMessage>}
    </div>
  );
}
