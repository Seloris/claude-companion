import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryBoard, FactoryRun } from "../data/factoryTypes.ts";
import styles from "./FactoryLiveRuns.module.css";
import { FactoryPendingCommit } from "./FactoryPendingCommit.tsx";
import { FactoryRunSession } from "./FactoryRunSession.tsx";
import { isUnderway, runDuration, runStateLabel, shownPhase, stepLabel, withPlanName } from "./labels.ts";

// FR-12: the live runs of a board, one line each; a click unfolds the feature the run works on.
export function FactoryLiveRuns({
  board,
  now,
  onOpenFeature,
}: {
  board: FactoryBoard;
  now: Date;
  onOpenFeature: (slug: string) => void;
}) {
  return (
    <ul className={styles.runs} aria-label={t("factory.live.label")}>
      {board.live.map((run) => (
        <li key={`${run.sessionId}:${run.since}`}>
          <RunButton run={run} board={board} now={now} onOpenFeature={onOpenFeature} />
        </li>
      ))}
    </ul>
  );
}

function RunButton({
  run,
  board,
  now,
  onOpenFeature,
}: {
  run: FactoryRun;
  board: FactoryBoard;
  now: Date;
  onOpenFeature: (slug: string) => void;
}) {
  const { feature } = run;
  const phase = shownPhase(run);
  // A run with no feature (a spec or an autopilot not yet committed) has nothing to unfold; its session link still works,
  // so the line is a row of its own and the button holds only the text.
  return (
    <div className={styles.run}>
      <button
        type="button"
        className={styles.button}
        disabled={feature === null}
        onClick={() => feature !== null && onOpenFeature(feature)}
      >
        <span className={`${styles.status} ${styles[phase ?? run.status]}`}>
          {runStateLabel(run)}
          {board.isStale && isUnderway(run) ? ` · ${t("factory.run.atLastScan")}` : ""}
        </span>
        <span className={styles.feature}>{feature ?? t("factory.run.newFeature")}</span>
        <span className={styles.step}>{withPlanName(stepLabel(board, run), run.folder)}</span>
        <span className={styles.duration}>{runDuration(run, board, now)}</span>
      </button>
      <FactoryRunSession sessionId={run.sessionId} isStored={run.isStored} />
      {phase === "awaiting-commit" && run.pendingCommit !== null && (
        <div className={styles.commit}>
          <FactoryPendingCommit message={run.pendingCommit} />
        </div>
      )}
    </div>
  );
}
