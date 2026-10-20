import type { components } from "../../../api/schema.d.ts";
import { formatDuration, formatRelative } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { Field } from "../../../shared/ui/Field.tsx";
import { Select } from "../../../shared/ui/Select.tsx";
import styles from "./RefreshBar.module.css";

type RefreshStatus = components["schemas"]["RefreshStatus"];
// The generated type is nullable: the API document marks the report as such where the status refers to it.
type RefreshReport = NonNullable<components["schemas"]["RefreshReport"]>;
type RefreshMode = components["schemas"]["RefreshMode"];
type RefreshInterval = components["schemas"]["RefreshInterval"];

// session-ingestion FR-13: off, then the intervals the API accepts; "off" stands for the contract's null.
const OFF_VALUE = "off";
const INTERVAL_OPTIONS: { value: string; interval: RefreshInterval; label: string }[] = [
  { value: OFF_VALUE, interval: null, label: t("refresh.interval.off") },
  { value: "5", interval: 5, label: t("refresh.interval.minutes", { minutes: 5 }) },
  { value: "10", interval: 10, label: t("refresh.interval.minutes", { minutes: 10 }) },
  { value: "30", interval: 30, label: t("refresh.interval.minutes", { minutes: 30 }) },
  { value: "60", interval: 60, label: t("refresh.interval.hour") },
];

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
  intervalMinutes,
  isIntervalSaving,
  intervalError,
  scheduleError,
  onIntervalChange,
}: {
  status: RefreshStatus | undefined;
  isStarting: boolean;
  startError: string | null;
  onRefresh(mode: RefreshMode): void;
  // Undefined while the schedule is not loaded: the select waits for it.
  intervalMinutes: RefreshInterval | undefined;
  isIntervalSaving: boolean;
  intervalError: string | null;
  // The schedule could not be read: the select stays disabled, this says why.
  scheduleError: string | null;
  onIntervalChange(intervalMinutes: RefreshInterval): void;
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
        <Field label={t("refresh.interval.label")} error={null}>
          {(control) => (
            <Select
              {...control}
              value={intervalMinutes === undefined ? "" : (intervalMinutes === null ? OFF_VALUE : String(intervalMinutes))}
              disabled={intervalMinutes === undefined || isIntervalSaving}
              onChange={(event) => {
                const option = INTERVAL_OPTIONS.find((candidate) => candidate.value === event.target.value);
                if (option !== undefined) onIntervalChange(option.interval);
              }}
            >
              {intervalMinutes === undefined && <option value="" />}
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
      {scheduleError !== null && <ErrorMessage>{t("refresh.interval.loadFailed", { message: scheduleError })}</ErrorMessage>}
      {intervalError !== null && <ErrorMessage>{t("refresh.interval.failed", { message: intervalError })}</ErrorMessage>}
      {startError !== null && <ErrorMessage>{t("refresh.start.failed", { message: startError })}</ErrorMessage>}
    </div>
  );
}
