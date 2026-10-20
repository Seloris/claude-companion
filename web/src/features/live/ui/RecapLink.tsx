import { Link } from "react-router";
import { t } from "../../../shared/lib/i18n/index.ts";
import { ArrowUpRightIcon } from "../../../shared/ui/icons.tsx";
import styles from "./RecapLink.module.css";

// FR-10: the arrow to the stored session when the history already holds it; a session not yet refreshed shows the arrow
// greyed out and inert, in the same place, so that the actions do not move once it is stored. FR-42, FR-45: the arrow
// opens the recap in a dialog over the board, named by the address (`/live?session={id}`); a push, so that the browser's
// back button closes it, marked `recapOpenedHere` so that the dialog's own close goes back too. `data-recap-session`
// lets the page give the focus back to the arrow when a poll re-mounted it behind the dialog (FR-44).
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
    <Link
      className={styles.link}
      to={{ pathname: "/live", search: `?session=${encodeURIComponent(sessionId)}` }}
      state={{ recapOpenedHere: true }}
      preventScrollReset
      data-recap-session={sessionId}
      aria-label={label}
      title={label}
    >
      <ArrowUpRightIcon />
    </Link>
  );
}
