import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryRecap } from "../data/factoryTypes.ts";
import styles from "./FactoryRecapView.module.css";

// FR-26: the recap of a finished job: its text, else the subjects of its commits, else nothing.
export function FactoryRecapView({ recap }: { recap: FactoryRecap }) {
  if (recap.text !== null) return <p className={styles.text}>{recap.text}</p>;
  if (recap.commits.length === 0) return null;
  return (
    <div className={styles.recap}>
      <p className={styles.label}>{t("factory.recap.commits")}</p>
      <ul className={styles.commits}>
        {recap.commits.map((commit) => (
          <li key={commit.sha}>{commit.subject}</li>
        ))}
      </ul>
    </div>
  );
}
