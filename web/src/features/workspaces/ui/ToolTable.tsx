import type { components } from "../../../api/schema.d.ts";
import { formatNumber } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import styles from "./TokenTable.module.css";

type ToolUsage = components["schemas"]["ToolUsage"];

// FR-07: the calls summed per tool, the failed ones apart.
export function ToolTable({ tools }: { tools: ToolUsage[] }) {
  if (tools.length === 0) return <EmptyState>{t("session.tools.empty")}</EmptyState>;
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("session.tools.name")}</th>
            <th scope="col">{t("session.tools.server")}</th>
            <th scope="col">{t("session.tools.calls")}</th>
            <th scope="col">{t("session.tools.failed")}</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.name}>
              <th scope="row" className={styles.wrap}>
                {tool.name}
              </th>
              <td className={styles.text}>{tool.mcpServer ?? t("common.value.none")}</td>
              <td>{formatNumber(tool.callCount)}</td>
              <td>{formatNumber(tool.failedCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
