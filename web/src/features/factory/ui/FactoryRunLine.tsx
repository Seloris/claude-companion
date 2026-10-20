import { formatDateTime } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryBoard, FactoryRun } from "../data/factoryTypes.ts";
import styles from "./FactoryRunLine.module.css";
import { FactoryRunSession } from "./FactoryRunSession.tsx";
import { runDuration, runStatusLabel } from "./labels.ts";

// FR-15: one run under a timeline row: its date, its duration, its session and its status unless done.
export function FactoryRunLine({ run, board, now }: { run: FactoryRun; board: FactoryBoard; now: Date }) {
  const status = run.status === "done" ? null : runStatusLabel(run.status);
  return (
    <p className={styles.line}>
      <span>{formatDateTime(run.since)}</span>
      <span>{runDuration(run, board, now)}</span>
      <FactoryRunSession sessionId={run.sessionId} isStored={run.isStored} />
      {status !== null && (
        <span className={styles.status}>
          {status}
          {board.isStale && run.status === "waiting" || board.isStale && run.status === "running" ? ` · ${t("factory.run.atLastScan")}` : ""}
        </span>
      )}
    </p>
  );
}
