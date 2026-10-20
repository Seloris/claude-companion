import { t } from "../../../shared/lib/i18n/index.ts";
import styles from "./FactoryPendingCommit.module.css";

// FR-25: the commit message a turn ended on, shown as written.
export function FactoryPendingCommit({ message }: { message: string }) {
  return (
    <div className={styles.commit}>
      <p className={styles.label}>{t("factory.pendingCommit.label")}</p>
      <pre className={styles.message}>{message}</pre>
    </div>
  );
}
