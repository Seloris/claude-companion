import type { ReactNode } from "react";
import type { components } from "../../../api/schema.d.ts";
import { formatDateTime, formatDuration, formatNumber } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import styles from "./SessionFacts.module.css";
import { TokenCount } from "./TokenCount.tsx";

type SessionDetail = components["schemas"]["SessionDetail"];

export function SessionFacts({ session }: { session: SessionDetail }) {
  const none = t("common.value.none");
  const facts: [string, ReactNode][] = [
    [t("session.facts.startedAt"), formatDateTime(session.startedAt)],
    [t("session.facts.endedAt"), formatDateTime(session.endedAt)],
    [t("session.facts.duration"), formatDuration(session.durationMs)],
    [t("session.facts.models"), session.models.length > 0 ? session.models.join(", ") : none],
    [t("session.facts.gitBranch"), session.gitBranch ?? none],
    [t("session.facts.origin"), session.origin ?? none],
    [t("session.facts.prompts"), formatNumber(session.promptCount)],
    [t("session.facts.subagents"), formatNumber(session.subagentCount)],
    [
      t("session.facts.toolCalls"),
      t("session.facts.toolCallsValue", {
        count: formatNumber(session.toolCallCount),
        failed: formatNumber(session.failedToolCallCount),
      }),
    ],
    [t("session.facts.skillCalls"), formatNumber(session.skillCallCount)],
    [t("session.facts.agentTypes"), session.agentTypes.length > 0 ? session.agentTypes.join(", ") : none],
    [t("session.facts.tokens"), <TokenCount tokens={session.tokens} />],
  ];
  return (
    <dl className={styles.facts}>
      {facts.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
