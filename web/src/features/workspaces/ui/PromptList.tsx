import type { components } from "../../../api/schema.d.ts";
import { formatTime } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { List, ListItem, ListItemText } from "../../../shared/ui/List.tsx";
import styles from "./PromptList.module.css";

type SessionDetail = components["schemas"]["SessionDetail"];

export function PromptList({ prompts }: { prompts: SessionDetail["prompts"] }) {
  if (prompts.length === 0) return <EmptyState>{t("session.prompts.empty")}</EmptyState>;
  return (
    <List>
      {prompts.map((prompt) => (
        <ListItem key={prompt.position}>
          <ListItemText>
            <span className={styles.prompt}>
              <time className={styles.time} dateTime={prompt.sentAt}>
                {formatTime(prompt.sentAt)}
              </time>
              <span className={styles.text}>{prompt.text}</span>
            </span>
          </ListItemText>
        </ListItem>
      ))}
    </List>
  );
}
