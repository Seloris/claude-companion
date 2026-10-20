import { formatRelative } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { Closable } from "../../../shared/lib/useClosedMarks.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { CheckIcon } from "../../../shared/ui/icons.tsx";
import type { FactoryBoard, FactorySession } from "../data/factoryTypes.ts";
import styles from "./FactorySessions.module.css";
import { FactoryPendingCommit } from "./FactoryPendingCommit.tsx";
import { FactoryRecapView } from "./FactoryRecapView.tsx";
import { FactoryRunSession } from "./FactoryRunSession.tsx";
import { isUnderwayPhase, phaseLabel, stepLabel, toClosableSession, withPlanName } from "./labels.ts";

// FR-28: the factory sessions of a board, most recently changed first, those marked `Clôturée` left out.
// `Clôturer` is offered on a finished or interrupted session only.
export function FactorySessions({
  board,
  now,
  isClosed,
  onClose,
}: {
  board: FactoryBoard;
  now: Date;
  isClosed: (session: Closable) => boolean;
  onClose: (session: FactorySession) => void;
}) {
  const shown = board.sessions.filter((session) => !isClosed(toClosableSession(session)));
  if (shown.length === 0) return null;
  return (
    <ul className={styles.sessions} aria-label={t("factory.sessions.label")}>
      {shown.map((session) => (
        <li key={session.sessionId} className={styles.session}>
          <div className={styles.line}>
            <span className={`${styles.pill} ${styles[session.phase]}`}>
              {phaseLabel(session.phase)}
              {board.isStale && isUnderwayPhase(session.phase) ? ` · ${t("factory.run.atLastScan")}` : ""}
            </span>
            <span className={styles.feature}>{session.feature ?? t("factory.run.newFeature")}</span>
            <span className={styles.muted}>{withPlanName(stepLabel(board, session), session.folder)}</span>
            <span className={styles.muted}>{formatRelative(session.updatedAt, now)}</span>
            <FactoryRunSession sessionId={session.sessionId} isStored={session.isStored} />
            {(session.phase === "job-done" || session.phase === "interrupted") && (
              <Button
                aria-label={t("factory.sessions.closeLabel", { id: session.sessionId.slice(0, 8) })}
                onClick={() => onClose(session)}
              >
                <CheckIcon />
                {t("factory.sessions.close")}
              </Button>
            )}
          </div>
          {session.phase === "awaiting-commit" && session.pendingCommit !== null && (
            <FactoryPendingCommit message={session.pendingCommit} />
          )}
          {session.phase === "job-done" && session.recap !== null && <FactoryRecapView recap={session.recap} />}
        </li>
      ))}
    </ul>
  );
}
