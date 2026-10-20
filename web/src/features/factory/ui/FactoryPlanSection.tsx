import { t } from "../../../shared/lib/i18n/index.ts";
import { Disclosure } from "../../../shared/ui/Disclosure.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import type { SessionPlanState } from "../data/sessionPlanState.ts";
import styles from "./FactoryPlanSection.module.css";
import { planName } from "./labels.ts";
import { PlanMarkdown } from "./PlanMarkdown.tsx";

// The body of the recap's Plan section (factory-board FR-32): folded until opened, the plan's Markdown inside (FR-34),
// or the path that could not be read (FR-36). The section and its heading are the recap's.
export function FactoryPlanSection({ plan }: { plan: Exclude<SessionPlanState, { kind: "none" }> }) {
  if (plan.kind === "error") return <ErrorMessage>{t("common.state.error", { message: plan.message })}</ErrorMessage>;
  const { folder, title, content, path } = plan.plan;
  if (content === null) {
    const [before, after] = t("factory.plan.unreadable", { path: "\u0000" }).split("\u0000");
    return (
      <p className={styles.unreadable}>
        {before}
        <span className={styles.path}>{path}</span>
        {after}
      </p>
    );
  }
  return (
    <Disclosure summary={planSummary(planName(folder), title)}>
      <PlanMarkdown content={content} />
    </Disclosure>
  );
}

function planSummary(name: string | null, title: string | null): string {
  const parts = [name, title].filter((part): part is string => part !== null && part !== "");
  return parts.length === 0 ? t("factory.plan.untitled") : parts.join(" · ");
}
