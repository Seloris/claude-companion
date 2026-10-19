import { formatElapsed } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Disclosure } from "../../../shared/ui/Disclosure.tsx";
import { List, ListItem } from "../../../shared/ui/List.tsx";
import type { BoardSession } from "./board.ts";
import styles from "./IdleGroup.module.css";
import { RecapLink } from "./RecapLink.tsx";
import text from "./texts.module.css";
import { WorkspaceChip } from "./WorkspaceChip.tsx";

// FR-07: the idle sessions that are not recently finished, folded in one group, each reduced to its workspace, its title and since when it is idle.
export function IdleGroup({ sessions, now }: { sessions: BoardSession[]; now: Date }) {
  if (sessions.length === 0) return null;
  return (
    <Disclosure summary={tp("live.idle.count", sessions.length)}>
      <List>
        {sessions.map((session) => (
          <ListItem key={session.sessionId}>
            <span className={styles.row}>
              <WorkspaceChip workspace={session.workspace} />
              <span className={styles.title}>{session.title}</span>
              <span className={text.muted}>{t("live.idle.since", { duration: formatElapsed(session.statusSince, now) })}</span>
              <RecapLink sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
            </span>
          </ListItem>
        ))}
      </List>
    </Disclosure>
  );
}
