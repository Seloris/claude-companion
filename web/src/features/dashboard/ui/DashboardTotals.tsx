import type { components } from "../../../api/schema.d.ts";
import { formatNumber, formatTokens } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import styles from "./DashboardTotals.module.css";

type Totals = components["schemas"]["Dashboard"]["totals"];

// FR-09: the figures of the period, the tokens as the pages show them (input + output).
export function DashboardTotals({ totals }: { totals: Totals }) {
  const tokenDetail = t("tokens.count.detail", {
    input: formatNumber(totals.tokens.input),
    output: formatNumber(totals.tokens.output),
    cacheRead: formatNumber(totals.tokens.cacheRead),
    cacheWrite: formatNumber(totals.tokens.cacheWrite),
  });
  const figures: { label: string; value: string; title?: string }[] = [
    { label: t("dashboard.totals.sessions"), value: formatNumber(totals.sessionCount) },
    { label: t("dashboard.totals.prompts"), value: formatNumber(totals.promptCount) },
    {
      label: t("dashboard.totals.tokens"),
      value: formatTokens(totals.tokens.input + totals.tokens.output),
      title: tokenDetail,
    },
    { label: t("dashboard.totals.toolCalls"), value: formatNumber(totals.toolCallCount) },
    { label: t("dashboard.totals.skillCalls"), value: formatNumber(totals.skillCallCount) },
    { label: t("dashboard.totals.subagents"), value: formatNumber(totals.subagentCount) },
  ];
  return (
    <dl className={styles.totals}>
      {figures.map((figure) => (
        <div key={figure.label} className={styles.figure}>
          <dt className={styles.label}>{figure.label}</dt>
          <dd className={styles.value} title={figure.title}>
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
