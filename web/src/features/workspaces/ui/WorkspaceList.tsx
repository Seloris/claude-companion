import { Link } from "react-router";
import type { components } from "../../../api/schema.d.ts";
import { formatRelative } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { List, ListItem, ListItemText } from "../../../shared/ui/List.tsx";
import styles from "./rows.module.css";
import { TokenCount } from "./TokenCount.tsx";

type WorkspaceSummary = components["schemas"]["WorkspaceSummary"];

export function WorkspaceList({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  return (
    <List>
      {workspaces.map((workspace) => (
        <ListItem key={workspace.id}>
          <ListItemText>
            <span className={styles.main}>
              <Link className={styles.link} to={`/workspaces/${workspace.id}`}>
                {workspace.name}
              </Link>
              <span className={styles.meta}>{workspace.path}</span>
              <span className={styles.figures}>
                <span>{tp("workspaces.sessions.count", workspace.sessionCount)}</span>
                <span>
                  {t("workspaces.list.lastActivity", {
                    when:
                      workspace.lastActivityAt === null
                        ? t("common.value.none")
                        : formatRelative(workspace.lastActivityAt),
                  })}
                </span>
                <TokenCount tokens={workspace.tokens} />
              </span>
            </span>
          </ListItemText>
          {workspace.isScratch && <Badge>{t("workspaces.badge.scratch")}</Badge>}
        </ListItem>
      ))}
    </List>
  );
}
