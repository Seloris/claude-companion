import type { components } from "../../../api/schema.d.ts";
import { formatNumber } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import styles from "./TokenTable.module.css";

type SessionDetail = components["schemas"]["SessionDetail"];

export function TokenTable({ usages }: { usages: SessionDetail["usages"] }) {
  if (usages.length === 0) return <EmptyState>{t("session.usages.empty")}</EmptyState>;
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("session.usages.model")}</th>
            <th scope="col">{t("session.usages.input")}</th>
            <th scope="col">{t("session.usages.output")}</th>
            <th scope="col">{t("session.usages.cacheRead")}</th>
            <th scope="col">{t("session.usages.cacheWrite")}</th>
          </tr>
        </thead>
        <tbody>
          {usages.map((usage) => (
            <tr key={usage.model}>
              <th scope="row">{usage.model}</th>
              <td>{formatNumber(usage.tokens.input)}</td>
              <td>{formatNumber(usage.tokens.output)}</td>
              <td>{formatNumber(usage.tokens.cacheRead)}</td>
              <td>{formatNumber(usage.tokens.cacheWrite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
