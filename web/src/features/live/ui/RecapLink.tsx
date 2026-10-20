import { Link } from "react-router";
import { t } from "../../../shared/lib/i18n/index.ts";
import { ArrowUpRightIcon } from "../../../shared/ui/icons.tsx";
import styles from "./RecapLink.module.css";

// FR-10: the arrow to the stored session when the history already holds it; a session not yet refreshed shows the arrow
// greyed out and inert, in the same place, so that the actions do not move once it is stored.
export function RecapLink({ sessionId, title, isStored }: { sessionId: string; title: string; isStored: boolean }) {
  if (!isStored) {
    return (
      <span className={`${styles.link} ${styles.none}`} role="img" aria-label={t("live.tile.notStored")} title={t("live.tile.notStored")}>
        <ArrowUpRightIcon />
      </span>
    );
  }
  const label = t("live.tile.recapLabel", { title });
  return (
    <Link className={styles.link} to={`/sessions/${sessionId}`} aria-label={label} title={label}>
      <ArrowUpRightIcon />
    </Link>
  );
}
