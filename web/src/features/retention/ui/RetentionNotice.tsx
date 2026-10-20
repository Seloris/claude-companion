import type { components } from "../../../api/schema.d.ts";
import { formatDate } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Banner } from "../../../shared/ui/Banner.tsx";
import styles from "./RetentionNotice.module.css";

type LogRetentionStatus = components["schemas"]["LogRetentionStatus"];

// session-ingestion FR-14: the discreet line; FR-15: the banner that replaces it while log files not read yet will be deleted soon.
export function RetentionNotice({ retention, now }: { retention: LogRetentionStatus; now: Date }) {
  const { fileCount, nearestDeletionAt } = retention.unreadAtRisk;
  // The API gives a nearest date whenever a file is at risk.
  if (fileCount > 0 && nearestDeletionAt !== null) {
    // The nearest date already past reads as a risk in force: Claude Code deletes at its next start. Only the oldest file is known to be past it.
    const key = new Date(nearestDeletionAt).getTime() <= now.getTime() ? "retention.banner.overdue" : "retention.banner.upcoming";
    return <Banner>{tp(key, fileCount, { date: formatDate(nearestDeletionAt) })}</Banner>;
  }
  const days = tp("retention.line.days", retention.retentionDays);
  // session-ingestion BR-13: a retention that could not be read says it is the default.
  const parts = [
    t(retention.isDefault ? "retention.line.keptDefault" : "retention.line.kept", { days }),
    ...(retention.oldestLogAt === null ? [] : [t("retention.line.oldest", { date: formatDate(retention.oldestLogAt) })]),
    tp("retention.line.archived", retention.archivedSessionCount),
  ];
  return <p className={styles.line}>{parts.join(" · ")}</p>;
}
