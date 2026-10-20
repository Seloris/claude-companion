import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Disclosure } from "../../../shared/ui/Disclosure.tsx";
import { CheckIcon } from "../../../shared/ui/icons.tsx";
import type { FactoryBoard, FactoryFeature } from "../data/factoryTypes.ts";
import { FactoryPromptActions } from "./FactoryPromptActions.tsx";
import { FactoryRunLine } from "./FactoryRunLine.tsx";
import styles from "./FactoryTimeline.module.css";

// The row under which the prompt buttons stand: the step at hand, else the one running, else the end of the timeline.
function promptRowIndex(feature: FactoryFeature): number {
  const next = feature.steps.findIndex((row) => row.marker === "next");
  if (next >= 0) return next;
  const running = feature.steps.findIndex((row) => row.marker === "running");
  return running >= 0 ? running : feature.steps.length - 1;
}

// FR-15, FR-16: one row per step on a vertical rail, with its latest run under it and the earlier ones folded.
export function FactoryTimeline({
  board,
  feature,
  now,
  isReview,
  isBrowser,
  onReviewChange,
  onBrowserChange,
}: {
  board: FactoryBoard;
  feature: FactoryFeature;
  now: Date;
  isReview: boolean;
  isBrowser: boolean;
  onReviewChange: (checked: boolean) => void;
  onBrowserChange: (checked: boolean) => void;
}) {
  const promptIndex = promptRowIndex(feature);
  const prompts = (
    <FactoryPromptActions
      feature={feature}
      markers={board.markers}
      isReview={isReview}
      isBrowser={isBrowser}
      onReviewChange={onReviewChange}
      onBrowserChange={onBrowserChange}
    />
  );
  return (
    <>
      <ol className={styles.timeline}>
        {feature.steps.map((row, index) => {
          const [latest, ...earlier] = row.runs;
          return (
            <li key={row.step} className={`${styles.row} ${styles[row.marker]}`}>
              <span className={styles.dot} aria-hidden="true">
                {row.marker === "done" && <CheckIcon />}
              </span>
              <div className={styles.body}>
                <p className={styles.head}>
                  <span className={styles.title}>{row.title}</span>
                  <span className={styles.detail}>{row.detail}</span>
                </p>
                {row.step === "plan" && (feature.isNewPlan || feature.plan !== null) && (
                  <p className={styles.folder}>
                    {feature.isNewPlan ? t("factory.timeline.newPlan") : feature.plan?.folder}
                  </p>
                )}
                {latest !== undefined && <FactoryRunLine run={latest} board={board} now={now} />}
                {earlier.length > 0 && (
                  <Disclosure summary={tp("factory.timeline.earlierRuns", earlier.length)}>
                    <div className={styles.earlier}>
                      {earlier.map((run) => (
                        <FactoryRunLine key={`${run.sessionId}:${run.since}`} run={run} board={board} now={now} />
                      ))}
                    </div>
                  </Disclosure>
                )}
                {index === promptIndex && prompts}
              </div>
            </li>
          );
        })}
      </ol>
      {feature.steps.length === 0 && prompts}
    </>
  );
}
