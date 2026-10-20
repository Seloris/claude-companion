import type { CSSProperties } from "react";
import { formatRelative } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { Closable } from "../../../shared/lib/useClosedMarks.ts";
import type { FactoryActivity as FactoryActivityData, FactoryBoard } from "../data/factoryTypes.ts";
import styles from "./FactoryActivity.module.css";
import { FactoryPendingCommit } from "./FactoryPendingCommit.tsx";
import { FactoryRecapView } from "./FactoryRecapView.tsx";
import { FactoryRunSession } from "./FactoryRunSession.tsx";
import { findSessionRun, isUnderwayPhase, phaseLabel, runStepLabel, toClosableActivity, withPlanName } from "./labels.ts";

// FR-27: the session that most needs the person, as the mod picked it. A closed activity reads like an idle one (BR-04).
export function FactoryActivity({
  board,
  activity,
  now,
  isClosed,
}: {
  board: FactoryBoard;
  activity: FactoryActivityData;
  now: Date;
  isClosed: (session: Closable) => boolean;
}) {
  const closable = toClosableActivity(activity);
  const isAtRest = activity.phase === "idle" || (closable !== null && isClosed(closable));
  const phase = isAtRest ? "idle" : activity.phase;
  // FR-29, FR-30: the activity carries no folder or command: they come from the session's run on the board.
  const run =
    activity.sessionId === null || activity.step === null
      ? null
      : findSessionRun(board, { sessionId: activity.sessionId, feature: activity.feature, step: activity.step });
  const label = t("factory.activity.label");
  if (isAtRest) {
    return (
      <section className={`${styles.activity} ${styles.idle}`} aria-label={label}>
        <span className={styles.phase}>{phaseLabel("idle")}</span>
      </section>
    );
  }
  return (
    <section className={styles.activity} style={{ "--phase-color": `var(--factory-phase-${phase})` } as CSSProperties} aria-label={label}>
      <div className={styles.line}>
        <span className={styles.phase}>
          {phaseLabel(phase)}
          {board.isStale && isUnderwayPhase(phase) ? ` · ${t("factory.run.atLastScan")}` : ""}
        </span>
        <span className={styles.feature}>{activity.feature ?? t("factory.run.newFeature")}</span>
        {activity.step !== null && (
          <span className={styles.muted}>
            {withPlanName(
              runStepLabel(board, run ?? { feature: activity.feature, folder: null, command: "", step: activity.step }),
              run?.folder ?? null,
            )}
          </span>
        )}
        {activity.since !== null && (
          <span className={styles.muted}>{t("factory.activity.since", { when: formatRelative(activity.since, now) })}</span>
        )}
        {activity.sessionId !== null && <FactoryRunSession sessionId={activity.sessionId} isStored={activity.isStored} />}
      </div>
      {phase === "awaiting-commit" && activity.pendingCommit !== null && (
        <FactoryPendingCommit message={activity.pendingCommit} />
      )}
      {phase === "job-done" && activity.recap !== null && <FactoryRecapView recap={activity.recap} />}
    </section>
  );
}
