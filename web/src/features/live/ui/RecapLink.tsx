import { Link } from "react-router";
import { t } from "../../../shared/lib/i18n/index.ts";
import { ChevronIcon } from "../../../shared/ui/icons.tsx";
import styles from "./RecapLink.module.css";

// FR-10: the link to the stored session when the history already holds it; a session not yet refreshed has none.
export function RecapLink({ sessionId, title, isStored }: { sessionId: string; title: string; isStored: boolean }) {
  if (!isStored) return <span className={styles.none}>{t("live.tile.notStored")}</span>;
  return (
    <Link className={styles.link} to={`/sessions/${sessionId}`} aria-label={t("live.tile.recapLabel", { title })}>
      {t("live.tile.recap")}
      <ChevronIcon />
    </Link>
  );
}
