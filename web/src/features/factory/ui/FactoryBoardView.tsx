import { useState } from "react";
import { formatDateTime, formatRelative } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { Banner } from "../../../shared/ui/Banner.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { BranchIcon } from "../../../shared/ui/icons.tsx";
import { ToggleChipGroup } from "../../../shared/ui/ToggleChipGroup.tsx";
import {
  clearStateFilters,
  setExpanded,
  toggleStateFilter,
  type FactoryView,
} from "../data/factoryView.ts";
import type { FactoryBoard, FactoryFeatureState } from "../data/factoryTypes.ts";
import styles from "./FactoryBoardView.module.css";
import { FactoryActivity } from "./FactoryActivity.tsx";
import { FactoryFeatureCard } from "./FactoryFeatureCard.tsx";
import { FactoryLiveRuns } from "./FactoryLiveRuns.tsx";
import {
  cardId,
  FILTER_ORDER,
  STATE_COLOR,
  STATE_ORDER,
  stateLabel,
  type FactoryClosedMarks,
} from "./labels.ts";

function isFeatureState(id: string): id is FactoryFeatureState {
  return FILTER_ORDER.some((state) => state === id);
}

// One board: its branch line (FR-10), its age (FR-11), its activity (FR-27), its live runs (FR-12), its filters (FR-14) and its cards by state.
// The workspace page leaves out the live runs: its sessions are on the live page.
export function FactoryBoardView({
  board,
  isLiveRunsShown = true,
  now,
  view,
  closedMarks,
  isReview,
  isBrowser,
  onReviewChange,
  onBrowserChange,
}: {
  board: FactoryBoard;
  isLiveRunsShown?: boolean;
  now: Date;
  view: FactoryView;
  closedMarks: FactoryClosedMarks;
  isReview: boolean;
  isBrowser: boolean;
  onReviewChange: (checked: boolean) => void;
  onBrowserChange: (checked: boolean) => void;
}) {
  const [isDoneOpen, setDoneOpen] = useState(false);
  const expandedSlug = view.expanded[board.root] ?? null;
  const shownStates = view.stateFilters.length === 0 ? STATE_ORDER : STATE_ORDER.filter((s) => view.stateFilters.includes(s));
  // The finalized features show unfolded when their chip is pressed, else behind one line.
  // A persisted unfolded card of a finalized feature keeps its group open after a reload (FR-23).
  const isExpandedDone = board.features.some((f) => f.slug === expandedSlug && f.state === "done");
  const isDoneFolded = !view.stateFilters.includes("done") && !isDoneOpen && !isExpandedDone;

  function openFeature(slug: string) {
    const feature = board.features.find((f) => f.slug === slug);
    if (feature?.state === "done") setDoneOpen(true);
    // A card hidden by the state filters would unfold nothing: the filters give way.
    if (feature !== undefined && view.stateFilters.length > 0 && !view.stateFilters.includes(feature.state)) {
      clearStateFilters();
    }
    setExpanded(board.root, slug);
    // The card exists once the view has been redrawn.
    setTimeout(() => document.getElementById(cardId(board.root, slug))?.scrollIntoView({ block: "nearest" }), 0);
  }

  function renderCards(state: FactoryFeatureState) {
    return board.features
      .filter((feature) => feature.state === state)
      .map((feature) => (
        <FactoryFeatureCard
          key={feature.slug}
          board={board}
          feature={feature}
          now={now}
          isExpanded={expandedSlug === feature.slug}
          onToggle={() => setExpanded(board.root, expandedSlug === feature.slug ? null : feature.slug)}
          isReview={isReview}
          isBrowser={isBrowser}
          onReviewChange={onReviewChange}
          onBrowserChange={onBrowserChange}
        />
      ));
  }

  function renderGroup(state: FactoryFeatureState) {
    const features = board.features.filter((feature) => feature.state === state);
    if (features.length === 0) return null;
    if (state === "done" && isDoneFolded) {
      return (
        <button key={state} type="button" className={styles.folded} aria-expanded={false} onClick={() => setDoneOpen(true)}>
          {tp("factory.done.folded", features.length, { slugs: features.map((f) => f.slug).join(", ") })}
        </button>
      );
    }
    return (
      <section key={state} className={styles.group} aria-label={stateLabel(state)}>
        <h3 className={styles.groupTitle}>
          {stateLabel(state)} <span className={styles.groupCount}>{features.length}</span>
        </h3>
        {renderCards(state)}
      </section>
    );
  }

  function renderContent() {
    if (board.error !== null) return <ErrorMessage>{t("factory.board.error", { message: board.error })}</ErrorMessage>;
    const counts = new Map<FactoryFeatureState, number>();
    for (const feature of board.features) counts.set(feature.state, (counts.get(feature.state) ?? 0) + 1);
    return (
      <>
        {isLiveRunsShown && board.live.length > 0 && <FactoryLiveRuns board={board} now={now} onOpenFeature={openFeature} />}
        {board.features.length === 0 ? (
          <p className={styles.empty}>{t("factory.board.noFeature")}</p>
        ) : (
          <>
            <ToggleChipGroup
              label={t("factory.filters.label")}
              allLabel={t("factory.filters.all")}
              items={FILTER_ORDER.map((state) => ({
                id: state,
                label: stateLabel(state),
                count: counts.get(state) ?? 0,
                color: STATE_COLOR[state],
              }))}
              selected={view.stateFilters}
              onToggle={(id) => isFeatureState(id) && toggleStateFilter(id)}
              onClear={clearStateFilters}
            />
            <div className={styles.groups}>{shownStates.map(renderGroup)}</div>
          </>
        )}
      </>
    );
  }

  return (
    <section className={styles.board} aria-label={board.branch ?? board.root}>
      <header className={styles.header}>
        <p className={styles.branchLine}>
          <span className={styles.branch}>
            <BranchIcon />
            {board.branch ?? t("factory.board.noBranch")}
          </span>
          <span>{t("factory.board.base", { base: board.baseBranch })}</span>
          {board.aheadCount !== null && <span>{tp("factory.board.ahead", board.aheadCount)}</span>}
          <span>{tp("factory.board.changed", board.changedCount)}</span>
          <span>{t("factory.board.scanned", { when: formatRelative(board.scannedAt, now) })}</span>
        </p>
        <p className={styles.root}>{board.root}</p>
        <p className={styles.root}>
          {t("factory.board.plugins", {
            factory: board.plugins.factory ?? t("factory.board.pluginMissing"),
            factoryBoard: board.plugins.factoryBoard ?? t("factory.board.pluginMissing"),
          })}
        </p>
      </header>
      {board.isStale && <Banner>{t("factory.board.stale", { when: formatDateTime(board.scannedAt) })}</Banner>}
      {board.activity !== null && (
        <FactoryActivity board={board} activity={board.activity} now={now} isClosed={closedMarks.isClosed} />
      )}
      {renderContent()}
    </section>
  );
}
