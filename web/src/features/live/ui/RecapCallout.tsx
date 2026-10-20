import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryRecap } from "../../factory/data/factoryTypes.ts";
import styles from "./RecapCallout.module.css";

// FR-37: the recap of a job done, as factory-board FR-26 gives it: its line when it has one, then its commits, each with
// its short hash and subject.
export function RecapCallout({ recap }: { recap: FactoryRecap }) {
  return (
    <div className={styles.callout} role="group" aria-label={t("live.recap.heading")}>
      <span className={styles.heading}>{t("live.recap.heading")}</span>
      {recap.text !== null && <p className={styles.text}>{recap.text}</p>}
      {recap.commits.length > 0 && (
        <ul className={styles.commits}>
          {recap.commits.map((commit) => (
            <li key={commit.sha}>
              <code className={styles.sha}>{commit.sha.slice(0, 7)}</code> {commit.subject}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
