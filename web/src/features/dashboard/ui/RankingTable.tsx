import { useState, type CSSProperties } from "react";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ChevronIcon } from "../../../shared/ui/icons.tsx";
import styles from "./RankingTable.module.css";

export interface RankingPart {
  key: string;
  name: string;
  value: number;
  label: string;
}

export interface RankingItem extends RankingPart {
  // A second figure shown beside the ranked one (an agent type's tokens).
  detail?: string;
  byWorkspace: RankingPart[];
}

const SHOWN_FIRST = 10;

function Bar({ value, max }: { value: number; max: number }) {
  const share: CSSProperties = { width: `${max === 0 ? 0 : (value / max) * 100}%` };
  return (
    <span className={styles.track} aria-hidden="true">
      <span className={styles.bar} style={share} />
    </span>
  );
}

function Row({ item, max }: { item: RankingPart & { detail?: string }; max: number }) {
  return (
    <span className={styles.row}>
      <span className={styles.name}>{item.name}</span>
      <span className={styles.figures}>
        <span className={styles.value}>{item.label}</span>
        {item.detail !== undefined && <span className={styles.detail}>{item.detail}</span>}
      </span>
      <Bar value={item.value} max={max} />
    </span>
  );
}

// FR-10, FR-11: a ranking, its bars relative to the first item; each item opens on its per-workspace breakdown.
export function RankingTable({ title, items }: { title: string; items: RankingItem[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const max = Math.max(0, ...items.map((item) => item.value));
  const shown = isExpanded ? items : items.slice(0, SHOWN_FIRST);
  return (
    <section className={styles.ranking}>
      <h3 className={styles.title}>{title}</h3>
      {items.length === 0 ? (
        <EmptyState>{t("dashboard.rankings.empty")}</EmptyState>
      ) : (
        <ol className={styles.items}>
          {shown.map((item) => (
            <li key={item.key} className={styles.item}>
              {item.byWorkspace.length === 0 ? (
                <Row item={item} max={max} />
              ) : (
                <details className={styles.details}>
                  <summary className={styles.summary} title={t("dashboard.rankings.byWorkspace", { name: item.name })}>
                    <span className={styles.chevron}>
                      <ChevronIcon />
                    </span>
                    <Row item={item} max={max} />
                  </summary>
                  <ul className={styles.parts}>
                    {item.byWorkspace.map((part) => (
                      <li key={part.key}>
                        <Row item={part} max={item.value} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {items.length > SHOWN_FIRST && (
        <Button variant="quiet" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? t("dashboard.rankings.showLess") : t("dashboard.rankings.showAll", { count: items.length })}
        </Button>
      )}
    </section>
  );
}
