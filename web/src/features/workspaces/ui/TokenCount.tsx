import type { components } from "../../../api/schema.d.ts";
import { formatNumber, formatTokens } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";

type TokenCounts = components["schemas"]["TokenCounts"];

// The figure the pages show is input + output, cache excluded; the four counters are in its title.
export function TokenCount({ tokens }: { tokens: TokenCounts }) {
  const detail = t("tokens.count.detail", {
    input: formatNumber(tokens.input),
    output: formatNumber(tokens.output),
    cacheRead: formatNumber(tokens.cacheRead),
    cacheWrite: formatNumber(tokens.cacheWrite),
  });
  return <span title={detail}>{t("tokens.count.label", { count: formatTokens(tokens.input + tokens.output) })}</span>;
}
