import type { components } from "../../../api/schema.d.ts";
import { formatTime } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { List, ListItem, ListItemText } from "../../../shared/ui/List.tsx";
import styles from "./ActivityTimeline.module.css";

type ActivityEntry = components["schemas"]["ActivityEntry"];

function entryKey(entry: ActivityEntry, index: number): string {
  if (entry.kind === "prompt") return `prompt-${entry.position}`;
  if (entry.kind === "subagent") return `subagent-${entry.agentId}`;
  return `skill-${index}`;
}

function EntryBody({ entry }: { entry: ActivityEntry }) {
  if (entry.kind === "prompt") return <span className={styles.text}>{entry.text}</span>;
  if (entry.kind === "skill") {
    const origin = entry.isTyped
      ? t("session.activity.skill.typed")
      : entry.agentType === null
        ? t("session.activity.skill.byClaude")
        : t("session.activity.skill.byAgent", { agentType: entry.agentType });
    return (
      <span className={styles.body}>
        <span className={styles.name}>
          {entry.name}
          {entry.args !== null && <span className={styles.args}> {entry.args}</span>}
        </span>
        <span className={styles.meta}>{origin}</span>
      </span>
    );
  }
  return (
    <span className={styles.body}>
      <span className={styles.name}>{entry.agentType}</span>
      {entry.description !== "" && <span className={styles.text}>{entry.description}</span>}
      {entry.model !== null && <span className={styles.meta}>{entry.model}</span>}
    </span>
  );
}

// FR-06: what happened in the session, in time order, so the person reads what followed each prompt.
export function ActivityTimeline({ activity }: { activity: ActivityEntry[] }) {
  if (activity.length === 0) return <EmptyState>{t("session.activity.empty")}</EmptyState>;
  return (
    <List>
      {activity.map((entry, index) => (
        <ListItem key={entryKey(entry, index)}>
          <ListItemText>
            <span className={styles.entry}>
              <span className={styles.head}>
                <time className={styles.time} dateTime={entry.at}>
                  {formatTime(entry.at)}
                </time>
                <Badge>{t(`session.activity.kind.${entry.kind}`)}</Badge>
              </span>
              <EntryBody entry={entry} />
            </span>
          </ListItemText>
        </ListItem>
      ))}
    </List>
  );
}
