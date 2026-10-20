import type { components } from "../../../api/schema.d.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { SessionPlanState } from "../../factory/data/sessionPlanState.ts";
import { FactoryPlanSection } from "../../factory/ui/FactoryPlanSection.tsx";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
import { SessionFacts } from "./SessionFacts.tsx";
import styles from "./SessionRecap.module.css";
import { SubagentTable } from "./SubagentTable.tsx";
import { TokenTable } from "./TokenTable.tsx";
import { ToolTable } from "./ToolTable.tsx";

type SessionDetail = components["schemas"]["SessionDetail"];

// A stored session's recap: its facts, the plan it works on (factory-board FR-32, none when it has no plan: FR-37),
// then its tokens per model, activity, subagents and tools. The session page and the live page's dialog draw the same
// one (FR-42). A fragment: its container spaces the groups.
export function SessionRecap({ session, plan }: { session: SessionDetail; plan: SessionPlanState }) {
  return (
    <>
      <SessionFacts session={session} />
      {plan.kind !== "none" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("factory.plan.title")}</h2>
          <FactoryPlanSection plan={plan} />
        </section>
      )}
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
