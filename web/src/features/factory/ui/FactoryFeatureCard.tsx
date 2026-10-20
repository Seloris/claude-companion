import type { CSSProperties } from "react";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { ChevronIcon } from "../../../shared/ui/icons.tsx";
import type { FactoryBoard, FactoryFeature } from "../data/factoryTypes.ts";
import styles from "./FactoryFeatureCard.module.css";
import { FactoryStageSegments } from "./FactoryStageSegments.tsx";
import { FactoryTimeline } from "./FactoryTimeline.tsx";
import { cardId, runStepLabel, STATE_COLOR, stateLabel, withPlanName } from "./labels.ts";

// FR-13, FR-15: a feature as a card framed in its state's colour; the header unfolds the timeline.
export function FactoryFeatureCard({
  board,
  feature,
  now,
  isExpanded,
  onToggle,
  isReview,
  isBrowser,
  onReviewChange,
  onBrowserChange,
}: {
  board: FactoryBoard;
  feature: FactoryFeature;
  now: Date;
  isExpanded: boolean;
  onToggle: () => void;
  isReview: boolean;
  isBrowser: boolean;
  onReviewChange: (checked: boolean) => void;
  onBrowserChange: (checked: boolean) => void;
}) {
  const { autopilot } = feature;
  const bodyId = `${cardId(board.root, feature.slug)}:body`;
  return (
    <article
      id={cardId(board.root, feature.slug)}
      className={styles.card}
      style={{ "--state-color": STATE_COLOR[feature.state] } as CSSProperties}
    >
      <button
        type="button"
        className={styles.header}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className={styles.chevron}>
          <ChevronIcon />
        </span>
        <span className={styles.slug}>{feature.slug}</span>
        <span className={styles.state}>{stateLabel(feature.state)}</span>
        {autopilot !== null && (
          <Badge tone="attention">
            {t("factory.card.autopilot", { step: withPlanName(runStepLabel(board, autopilot), autopilot.folder) })}
          </Badge>
        )}
        <FactoryStageSegments feature={feature} />
        {feature.title !== feature.slug && <span className={styles.title}>{feature.title}</span>}
      </button>
      {isExpanded && (
        <div id={bodyId} className={styles.body}>
          <FactoryTimeline
            board={board}
            feature={feature}
            now={now}
            isReview={isReview}
            isBrowser={isBrowser}
            onReviewChange={onReviewChange}
            onBrowserChange={onBrowserChange}
          />
        </div>
      )}
    </article>
  );
}
