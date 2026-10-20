import type { components } from "../../../api/schema.d.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
import { SessionFacts } from "./SessionFacts.tsx";
import styles from "./SessionRecap.module.css";
import { SubagentTable } from "./SubagentTable.tsx";
import { TokenTable } from "./TokenTable.tsx";
import { ToolTable } from "./ToolTable.tsx";

type SessionDetail = components["schemas"]["SessionDetail"];

// A stored session's recap: its facts, then its tokens per model, activity, subagents and tools. The session page and
// the live page's dialog draw the same one (FR-42). A fragment: its container spaces the groups.
export function SessionRecap({ session }: { session: SessionDetail }) {
  return (
    <>
      <SessionFacts session={session} />
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("session.usages.title")}</h2>
        <TokenTable usages={session.usages} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("session.activity.title")}</h2>
        <ActivityTimeline activity={session.activity} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("session.subagents.title")}</h2>
        <SubagentTable subagents={session.subagents} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("session.tools.title")}</h2>
        <ToolTable tools={session.tools} />
      </section>
    </>
  );
}
