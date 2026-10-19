import { Link } from "react-router";
import type { components } from "../../../api/schema.d.ts";
import { formatDateTime, formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { List, ListItem, ListItemText } from "../../../shared/ui/List.tsx";
import styles from "./rows.module.css";
import { TokenCount } from "./TokenCount.tsx";

type SessionSummary = components["schemas"]["SessionSummary"];

export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <List>
      {sessions.map((session) => (
        <ListItem key={session.id}>
          <ListItemText>
            <span className={styles.main}>
              <Link className={styles.link} to={`/sessions/${session.id}`}>
                {session.title}
              </Link>
              <span className={styles.figures}>
                <span>{formatDateTime(session.startedAt)}</span>
                <span>{formatDuration(session.durationMs)}</span>
                {session.models.length > 0 && <span>{session.models.join(", ")}</span>}
                {session.gitBranch !== null && <span>{session.gitBranch}</span>}
                <TokenCount tokens={session.tokens} />
              </span>
            </span>
          </ListItemText>
          {session.isArchived && <Badge>{t("sessions.badge.archived")}</Badge>}
        </ListItem>
      ))}
    </List>
  );
}
