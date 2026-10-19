import type { components } from "../../../api/schema.d.ts";
import { formatElapsed } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { Disclosure } from "../../../shared/ui/Disclosure.tsx";
import { List, ListItem, ListItemText } from "../../../shared/ui/List.tsx";
import { LiveSessionCard } from "./LiveSessionCard.tsx";
import styles from "./LiveWorkspaceSection.module.css";
import { SessionTitle } from "./SessionTitle.tsx";
import text from "./texts.module.css";

type LiveWorkspace = components["schemas"]["LiveWorkspace"];
type LiveSession = components["schemas"]["LiveSession"];

// FR-07: an idle session is reduced to its title and since when it is idle.
function IdleSessionRow({ session, now }: { session: LiveSession; now: Date }) {
  return (
    <ListItem>
      <ListItemText>
        <span className={styles.idleRow}>
          <SessionTitle sessionId={session.sessionId} title={session.title} isStored={session.isStored} />
          <span className={text.muted}>{t("live.idle.since", { duration: formatElapsed(session.statusSince, now) })}</span>
        </span>
      </ListItemText>
    </ListItem>
  );
}

export function LiveWorkspaceSection({ workspace, now }: { workspace: LiveWorkspace; now: Date }) {
  // The API orders the sessions of a workspace; filtering keeps that order on both sides.
  const activeSessions = workspace.sessions.filter((session) => session.status !== "idle");
  const idleSessions = workspace.sessions.filter((session) => session.status === "idle");
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.name}>{workspace.name}</h2>
        {workspace.isScratch && <Badge tone="muted">{t("live.workspace.scratch")}</Badge>}
      </header>
      {activeSessions.length > 0 && (
        <List>
          {activeSessions.map((session) => (
            <LiveSessionCard key={session.sessionId} session={session} now={now} />
          ))}
        </List>
      )}
      {idleSessions.length > 0 && (
        <Disclosure summary={tp("live.idle.count", idleSessions.length)}>
          <List>
            {idleSessions.map((session) => (
              <IdleSessionRow key={session.sessionId} session={session} now={now} />
            ))}
          </List>
        </Disclosure>
      )}
    </section>
  );
}
