import { Link } from "react-router";
import { t } from "../../../shared/lib/i18n/index.ts";
import styles from "./FactoryRunSession.module.css";

// FR-19: the first characters of the session id, a link to the stored session page when the history holds the session.
export function FactoryRunSession({ sessionId, isStored }: { sessionId: string; isStored: boolean }) {
  const label = t("factory.run.session", { id: sessionId.slice(0, 8) });
  if (!isStored) return <span className={styles.text}>{label}</span>;
  return (
    <Link className={styles.link} to={`/sessions/${encodeURIComponent(sessionId)}`}>
      {label}
    </Link>
  );
}
