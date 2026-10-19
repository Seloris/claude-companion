import type { components } from "../../../api/schema.d.ts";
import { formatNumber } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import styles from "./TokenTable.module.css";
import { TokenCount } from "./TokenCount.tsx";

type SubagentSummary = components["schemas"]["SubagentSummary"];

export function SubagentTable({ subagents }: { subagents: SubagentSummary[] }) {
  if (subagents.length === 0) return <EmptyState>{t("session.subagents.empty")}</EmptyState>;
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("session.subagents.type")}</th>
            <th scope="col">{t("session.subagents.description")}</th>
            <th scope="col">{t("session.subagents.model")}</th>
            <th scope="col">{t("session.subagents.tokens")}</th>
            <th scope="col">{t("session.subagents.toolCalls")}</th>
          </tr>
        </thead>
        <tbody>
          {subagents.map((subagent) => (
            <tr key={subagent.agentId}>
              <th scope="row">
                <span className={styles.cell}>
                  {subagent.agentType}
                  {subagent.isLogMissing && <Badge>{t("session.subagents.logMissing")}</Badge>}
                </span>
              </th>
              <td className={styles.wrap}>{subagent.description}</td>
              <td className={styles.text}>{subagent.model ?? t("common.value.none")}</td>
              <td>
                <TokenCount tokens={subagent.tokens} />
              </td>
              <td>{formatNumber(subagent.toolCallCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
