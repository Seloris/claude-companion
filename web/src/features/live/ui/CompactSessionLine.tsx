import { formatElapsed } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import type { PromptSwitches } from "../../../shared/lib/promptSwitches.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ButtonLink } from "../../../shared/ui/ButtonLink.tsx";
import { CheckIcon, DesktopIcon } from "../../../shared/ui/icons.tsx";
import { commitSubjectOf, factoryBandJob, factoryPhaseOf, type BoardSession, type TileState } from "./board.ts";
import { CommitCallout } from "./CommitCallout.tsx";
import styles from "./CompactSessionLine.module.css";
import { FactoryBand } from "./FactoryBand.tsx";
import { activityLabel, originLabel, pillLabel, waitingForLabel } from "./labels.ts";
import { FactoryMarks } from "./LiveSessionTile.tsx";
import { NextStepButton } from "./NextStepButton.tsx";
import { RecapLink } from "./RecapLink.tsx";
import { StatusPill } from "./StatusPill.tsx";
import { WorkspaceSquare } from "./WorkspaceChip.tsx";

// What counts on a running line: its activity, with its subagents and queued prompts when it has some.
function activitySummary(session: BoardSession): string {
  const parts = [session.currentActivity === null ? t("live.activity.unknown") : activityLabel(session.currentActivity)];
  if (session.runningSubagents.length > 0) parts.push(tp("live.compact.subagents", session.runningSubagents.length));
  if (session.queuedPrompts.length > 0) parts.push(tp("live.compact.queued", session.queuedPrompts.length));
  return parts.join(" · ");
}

// FR-40: one session on one line: its workspace's square (colour and initials), its title over its workspace, branch and origin, its pill, its
// factory band in short or `Hors workflow`, what counts (the commit to validate, the question, the recap, the last reply
// or the activity), since when, and the tile's actions.
export function CompactSessionLine({
  session,
  state,
  now,
  isHighlighted,
  switches,
  onClose,
}: {
  session: BoardSession;
  state: TileState;
  now: Date;
  isHighlighted: boolean;
  switches: PromptSwitches;
  onClose: () => void;
}) {
  const { column, pill } = state;
  const phase = factoryPhaseOf(session);
  const commitSubject = commitSubjectOf(session);
  const recap = column === "finished" && phase === "job-done" ? (session.factory?.run.recap ?? null) : null;
  const bandJob = factoryBandJob(session);
  const facts = [session.workspace.name, session.gitBranch, session.origin === null ? null : originLabel(session.origin)]
    .filter((part) => part !== null)
    .join(" · ");
  const classes = [styles.line, styles[column], isHighlighted ? styles.isHighlighted : ""].filter(Boolean).join(" ");

  function renderWhat() {
    if (session.status === "awaitingAnswer") {
      const question = session.question ?? waitingForLabel(session.waitingFor);
      return (
        <span className={`${styles.what} ${styles.question}`} title={question}>
          {question}
        </span>
      );
    }
    if (commitSubject !== null) {
      return <CommitCallout subject={commitSubject} desktopLink={session.desktopLink} title={session.title} isCompact />;
    }
    if (recap !== null) {
      const line = recap.text ?? recap.commits[0]?.subject ?? null;
      if (line !== null) {
        return (
          <span className={`${styles.what} ${styles.recap}`} title={line}>
            {line}
          </span>
        );
      }
    }
    if (column === "finished") {
      const reply = session.lastReply ?? t("live.reply.none");
      return (
        <span className={styles.what} title={reply}>
          {reply}
        </span>
      );
    }
    const summary = activitySummary(session);
    return (
      <span className={styles.what} title={summary}>
        {summary}
      </span>
    );
  }

  return (
    <li className={classes}>
      <WorkspaceSquare workspace={session.workspace} />
      <span className={styles.identity}>
        <span className={styles.title} title={session.title}>
          {session.title}
        </span>
        <span className={styles.facts} title={facts}>
          {facts}
        </span>
      </span>
      <span className={styles.pill}>
        <StatusPill pill={pill} label={pillLabel(pill)} />
      </span>
      <span className={styles.factory}>
        {bandJob !== null && <FactoryBand job={bandJob} now={now} isCompact />}
        <FactoryMarks session={session} />
      </span>
      <span className={styles.whatCell}>{renderWhat()}</span>
      <span className={styles.since}>{formatElapsed(session.statusSince, now)}</span>
      <span className={styles.actions}>
        {column === "finished" && phase === "job-done" && session.factory !== null && (
          <NextStepButton job={session.factory} switches={switches} desktopLink={session.desktopLink} isCompact />
        )}
        {column === "finished" && (
          <Button
            variant={phase === "job-done" ? "primary" : "quiet"}
            aria-label={t("live.tile.closeLabel", { title: session.title })}
            onClick={onClose}
          >
            <CheckIcon />
            {t("live.tile.close")}
          </Button>
        )}
        {session.desktopLink !== null && isDesktopLink(session.desktopLink) && (
          <ButtonLink variant="ghost" href={session.desktopLink} aria-label={t("live.tile.desktopLabel", { title: session.title })}>
            <DesktopIcon />
          </ButtonLink>
        )}
        <RecapLink sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
      </span>
    </li>
  );
}
