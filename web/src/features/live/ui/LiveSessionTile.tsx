import type { components } from "../../../api/schema.d.ts";
import { formatDateTime, formatDuration, formatElapsed, formatTime } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ButtonLink } from "../../../shared/ui/ButtonLink.tsx";
import { BranchIcon, DesktopIcon, EyeIcon } from "../../../shared/ui/icons.tsx";
import type { BoardSession } from "./board.ts";
import { originLabel, waitingForLabel } from "./labels.ts";
import styles from "./LiveSessionTile.module.css";
import { RecapLink } from "./RecapLink.tsx";
import { RunningSubagentList } from "./RunningSubagentList.tsx";
import { StatusPill, type PillStatus } from "./StatusPill.tsx";
import text from "./texts.module.css";
import { WorkspaceChip } from "./WorkspaceChip.tsx";

type CurrentActivity = NonNullable<components["schemas"]["CurrentActivity"]>;

function activityLabel(activity: CurrentActivity): string {
  switch (activity.kind) {
    case "tool":
      return t("live.activity.tool", { name: activity.toolName });
    case "agent":
      return t("live.activity.agent", { type: activity.agentType, description: activity.description });
    case "subagents":
      return t("live.activity.subagents");
    case "thinking":
      return t("live.activity.thinking");
  }
}

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

// A start on another day shows its date: a time alone would be ambiguous.
function startLabel(iso: string, now: Date): string {
  return new Date(iso).toDateString() === now.toDateString() ? formatTime(iso) : formatDateTime(iso);
}

// One live session, with the same layout in its three states: workspace, title, status, what it does, asks or answered,
// last prompt, queue and footer.
export function LiveSessionTile({
  session,
  kind,
  now,
  isHighlighted,
  onMarkSeen,
}: {
  session: BoardSession;
  kind: PillStatus;
  now: Date;
  isHighlighted: boolean;
  onMarkSeen: () => void;
}) {
  const turnMs =
    session.turnStartedAt === null
      ? 0
      : Math.max(0, new Date(session.statusSince).getTime() - new Date(session.turnStartedAt).getTime());
  const classes = [styles.tile, styles[kind], isHighlighted ? styles.isHighlighted : ""].filter(Boolean).join(" ");
  const statusLabel = kind === "finished" ? t("live.status.finished") : t(`live.status.${session.status}`);
  const sinceDuration = formatElapsed(session.statusSince, now);
  return (
    <article className={classes}>
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
      <h3 className={styles.title}>{session.title}</h3>
      <p className={styles.status}>
        <StatusPill status={kind} label={statusLabel} />
        <span className={text.muted}>
          {kind === "finished"
            ? t("live.status.ago", { duration: sinceDuration })
            : t("live.status.since", { duration: sinceDuration })}
        </span>
      </p>
      {kind === "running" && (
        <>
          <ActivityLine activity={session.currentActivity} />
          {session.runningSubagents.length > 0 && <RunningSubagentList subagents={session.runningSubagents} now={now} />}
        </>
      )}
      {kind === "awaiting" && (
        // FR-05: the question the person has to answer, or what the session waits for when there is none to show.
        <div className={`${styles.callout} ${styles.question}`} role="note">
          {session.question === null ? (
            <span>{waitingForLabel(session.waitingFor)}</span>
          ) : (
            <>
              <span className={text.clamp} title={session.question}>
                {session.question}
              </span>
              {session.questionCount > 1 && (
                <span className={text.muted}>{tp("live.question.more", session.questionCount - 1)}</span>
              )}
            </>
          )}
        </div>
      )}
      {kind === "finished" && (
        // FR-16, BR-11: Claude's last reply of the turn, or the fact that it wrote none.
        <div className={`${styles.callout} ${styles.reply}`}>
          <span className={styles.replyLabel}>{t("live.reply.label")}</span>
          {session.lastReply === null ? (
            <span className={text.muted}>{t("live.reply.none")}</span>
          ) : (
            <span className={text.clampLong} title={session.lastReply}>
              {session.lastReply}
            </span>
          )}
        </div>
      )}
      {session.lastPrompt !== null && (
        <div className={styles.block}>
          <span className={text.label}>{t("live.prompt.last")}</span>
          <span className={text.clamp} title={session.lastPrompt}>
            {session.lastPrompt}
          </span>
        </div>
      )}
      {session.queuedPrompts[0] !== undefined && (
        <p className={`${styles.queue} ${text.muted}`} title={session.queuedPrompts.join("\n")}>
          <span className={text.clamp}>
            {t("live.prompt.queued", { count: session.queuedPrompts.length, first: session.queuedPrompts[0] })}
          </span>
        </p>
      )}
      <footer className={styles.footer}>
        <span className={`${styles.when} ${text.muted}`}>
          {kind === "finished"
            ? t("live.tile.turn", { duration: formatDuration(turnMs) })
            : t("live.tile.started", {
                time: startLabel(session.startedAt, now),
                duration: formatElapsed(session.startedAt, now),
              })}
        </span>
        <span className={styles.actions}>
          {kind === "finished" && (
            <Button aria-label={t("live.tile.seenLabel", { title: session.title })} onClick={onMarkSeen}>
              <EyeIcon />
              {t("live.tile.seen")}
            </Button>
          )}
          {session.desktopLink !== null && isDesktopLink(session.desktopLink) && (
            // Live-sessions FR-31: the link that opens the session in the desktop app, when it has one.
            <ButtonLink variant="ghost" href={session.desktopLink} aria-label={t("live.tile.desktopLabel", { title: session.title })}>
              <DesktopIcon />
              {t("live.tile.desktop")}
            </ButtonLink>
          )}
          <RecapLink sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
        </span>
      </footer>
    </article>
  );
}
