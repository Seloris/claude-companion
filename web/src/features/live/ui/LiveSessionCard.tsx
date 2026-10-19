import type { components } from "../../../api/schema.d.ts";
import { formatDateTime, formatElapsed, formatTime } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { ListItem } from "../../../shared/ui/List.tsx";
import styles from "./LiveSessionCard.module.css";
import { originLabel, waitingForLabel } from "./labels.ts";
import { RunningSubagentList } from "./RunningSubagentList.tsx";
import { SessionTitle } from "./SessionTitle.tsx";
import text from "./texts.module.css";

type LiveSession = components["schemas"]["LiveSession"];
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

export function LiveSessionCard({ session, now }: { session: LiveSession; now: Date }) {
  const isAwaiting = session.status === "awaitingAnswer";
  return (
    <ListItem>
      <article className={styles.card}>
        <header className={styles.header}>
          <h3 className={styles.title}>
            <SessionTitle sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
          </h3>
          <span className={styles.status}>
            <Badge tone={isAwaiting ? "attention" : "default"}>{t(`live.status.${session.status}`)}</Badge>
            <span className={text.muted}>
              {t("live.status.since", { duration: formatElapsed(session.statusSince, now) })}
            </span>
          </span>
        </header>
        <p className={`${styles.facts} ${text.muted}`}>
          <span>{t("live.facts.startedAt", { time: startLabel(session.startedAt, now) })}</span>
          <span>
            {t("live.facts.duration", {
              duration: formatElapsed(session.startedAt, now),
            })}
          </span>
          {session.origin !== null && <span>{originLabel(session.origin)}</span>}
          {session.gitBranch !== null && <span>{t("live.facts.branch", { branch: session.gitBranch })}</span>}
        </p>
        {session.status === "running" && (
          <>
            <ActivityLine activity={session.currentActivity} />
            {session.runningSubagents.length > 0 && (
              <RunningSubagentList subagents={session.runningSubagents} now={now} />
            )}
          </>
        )}
        {isAwaiting && (
          // FR-05: the question the person has to answer, or what the session waits for when there is none to show.
          <div className={styles.question} role="note">
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
        {session.lastPrompt !== null && (
          <div className={styles.block}>
            <span className={text.label}>{t("live.prompt.last")}</span>
            <span className={text.clamp} title={session.lastPrompt}>
              {session.lastPrompt}
            </span>
          </div>
        )}
        {session.queuedPrompts.length > 0 && (
          <div className={styles.block}>
            <span className={text.label}>{t("live.prompt.queue")}</span>
            <ol className={styles.queue}>
              {session.queuedPrompts.map((prompt, index) => (
                // The queue is replayed in order and may hold the same text twice: the position is its identity.
                <li key={index}>
                  <span className={text.clamp} title={prompt}>
                    {prompt}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </article>
    </ListItem>
  );
}
