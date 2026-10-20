import { formatDateTime } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryBoard, FactoryRun } from "../data/factoryTypes.ts";
import styles from "./FactoryRunLine.module.css";
import { FactoryRunSession } from "./FactoryRunSession.tsx";
import { isUnderway, planName, runDuration, runStateLabel, shownPhase } from "./labels.ts";

// FR-15: one run under a timeline row: its date, its duration, its session and its phase (FR-24) unless done.
export function FactoryRunLine({ run, board, now }: { run: FactoryRun; board: FactoryBoard; now: Date }) {
  const phase = shownPhase(run);
  const isDone = phase === null ? run.status === "done" : phase === "job-done";
  const status = isDone ? null : runStateLabel(run);
  const plan = planName(run.folder);
  return (
    <p className={styles.line}>
      <span>{formatDateTime(run.since)}</span>
      <span>{runDuration(run, board, now)}</span>
      {plan !== null && plan !== "" && <span>{plan}</span>}
      <FactoryRunSession sessionId={run.sessionId} isStored={run.isStored} />
      {status !== null && (
        <span className={styles.status}>
          {status}
          {board.isStale && isUnderway(run) ?` · ${t("factory.run.atLastScan")}` : ""}
        </span>
      )}
    </p>
  );
}
