import { Link } from "react-router";
import styles from "./texts.module.css";

// FR-10: the title links to the stored session when the history already holds it.
export function SessionTitle({ sessionId, title, isStored }: { sessionId: string; title: string; isStored: boolean }) {
  return isStored ? (
    <Link className={styles.link} to={`/sessions/${sessionId}`}>
      {title}
    </Link>
  ) : (
    <span>{title}</span>
  );
}
