import { formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactorySessionJob } from "../../factory/data/factoryTypes.ts";
import { FactoryStageSegments } from "../../factory/ui/FactoryStageSegments.tsx";
import { jobStepLabel, planName, runStateLabel } from "../../factory/ui/labels.ts";
import styles from "./FactoryBand.module.css";

// FR-33: the factory job of a session, `feature › étape · plan`, with the stage segments of the feature's followed plan.
// FR-35: on a frozen board, the phase at the last scan, marked with the scan's age. `isCompact` (FR-40): the plan's name
// without its label, and the line cut to the room it has.
export function FactoryBand({ job, now, isCompact = false }: { job: FactorySessionJob; now: Date; isCompact?: boolean }) {
  const feature = job.run.feature ?? t("factory.run.newFeature");
  const step = jobStepLabel(job);
  const name = planName(job.run.folder);
  const plan = name === null || name === "" ? null : isCompact ? name : t("live.band.plan", { name });
  const fullText = [`${feature} › ${step}`, plan].filter((part) => part !== null).join(" · ");
  return (
    <div className={isCompact ? `${styles.band} ${styles.compact}` : styles.band} role="note" aria-label={t("live.band.label")}>
      <p className={styles.line} title={fullText}>
        <span className={styles.feature}>{feature}</span>
        <span aria-hidden="true"> › </span>
        <span className={styles.visuallyHidden}> : </span>
        <span>{step}</span>
        {plan !== null && <span className={styles.plan}> · {plan}</span>}
      </p>
      <span className={styles.trail}>
        {job.feature !== null && <FactoryStageSegments steps={job.feature.steps} />}
        {job.isStale && (
          <span className={styles.stale}>
            {t("live.band.atLastScan", {
              phase: runStateLabel(job.run),
              age: formatDuration(Math.max(0, now.getTime() - new Date(job.scannedAt).getTime())),
            })}
          </span>
        )}
      </span>
    </div>
  );
}
