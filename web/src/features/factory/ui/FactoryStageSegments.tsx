import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryFeature } from "../data/factoryTypes.ts";
import styles from "./FactoryStageSegments.module.css";

// FR-13: one segment per stage row of the timeline, coloured by the marker the mod exported (BR-02): never computed from
// the plan's counts.
export function FactoryStageSegments({ feature }: { feature: FactoryFeature }) {
  const stages = feature.steps.filter((row) => /^stage:\d+$/.test(row.step));
  if (stages.length === 0) return null;
  const doneCount = stages.filter((row) => row.marker === "done").length;
  return (
    <span
      className={styles.segments}
      role="img"
      aria-label={t("factory.stages.summary", { done: doneCount, total: stages.length })}
    >
      {stages.map((row) => (
        <span key={row.step} className={`${styles.segment} ${styles[row.marker]}`} />
      ))}
    </span>
  );
}
