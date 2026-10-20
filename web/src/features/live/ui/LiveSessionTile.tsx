import { formatElapsed } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import type { PromptSwitches } from "../../../shared/lib/promptSwitches.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ButtonLink } from "../../../shared/ui/ButtonLink.tsx";
import { BranchIcon, CheckIcon, ClockIcon, DesktopIcon } from "../../../shared/ui/icons.tsx";
import { commitSubjectOf, factoryBandJob, factoryPhaseOf, isOffWorkflow, type BoardSession, type TileState } from "./board.ts";
import { CommitCallout } from "./CommitCallout.tsx";
import { FactoryBand } from "./FactoryBand.tsx";
import { activityLabel, originLabel, pillLabel, startLabel, turnDuration, waitingForLabel, type CurrentActivity } from "./labels.ts";
import styles from "./LiveSessionTile.module.css";
import { NextStepButton } from "./NextStepButton.tsx";
import { RecapCallout } from "./RecapCallout.tsx";
import { RecapLink } from "./RecapLink.tsx";
import { RunningSubagentList } from "./RunningSubagentList.tsx";
import { StatusPill } from "./StatusPill.tsx";
import text from "./texts.module.css";
import { WorkspaceChip } from "./WorkspaceChip.tsx";

// FR-03: the tool, the agent, the subagents or the thinking, with the skill it runs under; unknown for a session too young to have a log.
function ActivityLine({ activity }: { activity: CurrentActivity | null }) {
  if (activity === null) return <p className={`${styles.activity} ${text.muted}`}>{t("live.activity.unknown")}</p>;
  const label = activityLabel(activity);
  return (
    <p className={styles.activity}>
      <span className={text.clamp} title={label}>
        {label}
        {activity.skill !== null && ` · ${t("live.activity.skill", { name: activity.skill })}`}
      </span>
    </p>
  );
}

// FR-34, FR-33: the `Hors workflow` mark of a session no factory board knows or whose run is a free request, or the
// `Autopilot` mark of a feature an autopilot works on.
export function FactoryMarks({ session }: { session: BoardSession }) {
  if (isOffWorkflow(session)) return <span className={styles.offWorkflow}>{t("live.mark.offWorkflow")}</span>;
  if (session.factory?.feature?.autopilot == null) return null;
  return <span className={styles.autopilot}>{t("live.mark.autopilot")}</span>;
}

// FR-02: one live session, top to bottom: its context, its title with its pill, its factory band, the callout that needs
// the person (the question, the commit to validate, the recap or the last reply), its activity, its last prompt and queue,
// and a footer with its start, its duration and its actions.
export function LiveSessionTile({
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
  const classes = [styles.tile, styles[column], isHighlighted ? styles.isHighlighted : ""].filter(Boolean).join(" ");
  const sinceDuration = formatElapsed(session.statusSince, now);
  const hasDesktopLink = session.desktopLink !== null && isDesktopLink(session.desktopLink);
  const bandJob = factoryBandJob(session);

  function renderCallout() {
    if (session.status === "awaitingAnswer") {
      // FR-05: the question the person has to answer, or what the session waits for when there is none to show.
      return (
        <div className={`${styles.callout} ${styles.question}`} role="note">
          {session.question === null ? (
            <span>{waitingForLabel(session.waitingFor)}</span>
          ) : (
            <>
              <span className={styles.calloutLabel}>{t("live.question.label")}</span>
              <span className={text.clamp} title={session.question}>
                {session.question}
              </span>
              {session.questionCount > 1 && (
                <span className={text.muted}>{tp("live.question.more", session.questionCount - 1)}</span>
              )}
            </>
          )}
        </div>
      );
    }
    if (commitSubject !== null) {
      return <CommitCallout subject={commitSubject} desktopLink={session.desktopLink} title={session.title} />;
    }
    if (recap !== null) return <RecapCallout recap={recap} />;
    if (column !== "finished") return null;
    // FR-16, BR-11: Claude's last reply of the turn, or the fact that it wrote none.
    return (
      <div className={`${styles.callout} ${styles.reply}`}>
        <span className={styles.calloutLabel}>{t("live.reply.label")}</span>
        {session.lastReply === null ? (
          <span className={text.muted}>{t("live.reply.none")}</span>
        ) : (
          <span className={text.clampLong} title={session.lastReply}>
            {session.lastReply}
          </span>
        )}
      </div>
    );
  }

  return (
    <article className={classes}>
      <div className={styles.context}>
        <p className={styles.meta}>
          <WorkspaceChip workspace={session.workspace} />
          {session.gitBranch !== null && (
            <span className={styles.branch} title={t("live.facts.branch", { branch: session.gitBranch })}>
              <BranchIcon />
              <span className={styles.branchName}>{session.gitBranch}</span>
            </span>
          )}
          {session.origin !== null && <span>{originLabel(session.origin)}</span>}
        </p>
        <FactoryMarks session={session} />
      </div>
      <div className={styles.heading}>
        <h3 className={styles.title}>{session.title}</h3>
        <p className={styles.status}>
          <StatusPill pill={pill} label={pillLabel(pill)} />
          <span className={text.muted}>
            {column === "finished"
              ? t("live.status.agoTurn", { ago: sinceDuration, turn: turnDuration(session) })
              : t("live.status.since", { duration: sinceDuration })}
          </span>
        </p>
      </div>
      {bandJob !== null && <FactoryBand job={bandJob} now={now} />}
      {renderCallout()}
      {column === "running" && (
        <>
          <ActivityLine activity={session.currentActivity} />
          {session.runningSubagents.length > 0 && <RunningSubagentList subagents={session.runningSubagents} now={now} />}
        </>
      )}
      {session.lastPrompt !== null && (
        // FR-06: the last prompt on one line, its full text on hover.
        <p className={styles.prompt} title={session.lastPrompt}>
          <span className={styles.promptLabel}>{t("live.prompt.last")}</span>
          <span className={styles.promptText}>{session.lastPrompt}</span>
        </p>
      )}
      {session.queuedPrompts[0] !== undefined && (
        <p className={`${styles.queue} ${text.muted}`} title={session.queuedPrompts.join("\n")}>
          <span className={text.clamp}>
            {t("live.prompt.queued", { count: session.queuedPrompts.length, first: session.queuedPrompts[0] })}
          </span>
        </p>
      )}
      <footer className={styles.footer}>
        <span className={`${styles.when} ${text.muted}`} role="group" aria-label={t("live.footer.label")}>
          <ClockIcon />
          <span>{startLabel(session.startedAt, now)}</span>
          <span className={styles.rule} aria-hidden="true" />
          <span>{formatElapsed(session.startedAt, now)}</span>
        </span>
        <span className={styles.actions}>
          {column === "finished" && phase === "job-done" && session.factory !== null && (
            <NextStepButton job={session.factory} switches={switches} desktopLink={session.desktopLink} />
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
          {hasDesktopLink && session.desktopLink !== null && (
            // FR-31: the icon that opens the session in the desktop app, when it has a link.
            <ButtonLink variant="ghost" href={session.desktopLink} aria-label={t("live.tile.desktopLabel", { title: session.title })}>
              <DesktopIcon />
            </ButtonLink>
          )}
          <RecapLink sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
        </span>
      </footer>
    </article>
  );
}
