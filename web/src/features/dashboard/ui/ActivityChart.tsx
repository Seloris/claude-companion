import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatDay } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import styles from "./ActivityChart.module.css";

export interface ChartDay {
  date: string;
  value: number;
  label: string;
}

// FR-12: one bar per day of the period, its height relative to the period's busiest day. Hovering a bar, or
// moving through the days with the arrow keys once the chart has the focus, reads its day and figure; the
// readout shows the maximum otherwise. The chart is one tab stop, however long the period.
export function ActivityChart({ title, days, formatValue }: { title: string; days: ChartDay[]; formatValue(value: number): string }) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const max = Math.max(0, ...days.map((day) => day.value));
  const activeIndex = days.findIndex((day) => day.date === activeDate);
  const active = days[activeIndex];
  const first = days[0];
  const last = days[days.length - 1];
  // A long period keeps 4px bars and 2px gaps: the chart scrolls instead of squeezing them.
  const width = { "--days": days.length } as CSSProperties;

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, activeIndex - 1),
      ArrowRight: Math.min(days.length - 1, activeIndex + 1),
      Home: 0,
      End: days.length - 1,
    };
    const next = days[moves[event.key] ?? -1];
    if (next === undefined) return;
    event.preventDefault();
    setActiveDate(next.date);
  }

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{title}</span>
        <span className={styles.readout} aria-live="polite">
          {active === undefined
            ? t("dashboard.activity.max", { value: formatValue(max) })
            : t("dashboard.activity.day", { date: formatDay(active.date), value: active.label })}
        </span>
      </figcaption>
      <div className={styles.scroll}>
        <ol
          className={styles.bars}
          style={width}
          tabIndex={0}
          aria-label={title}
          onKeyDown={onKeyDown}
          onFocus={() => setActiveDate((current) => current ?? last?.date ?? null)}
          onBlur={() => setActiveDate(null)}
          onMouseLeave={() => setActiveDate(null)}
        >
          {days.map((day) => {
            const height: CSSProperties = { height: `${max === 0 ? 0 : (day.value / max) * 100}%` };
            const description = t("dashboard.activity.day", { date: formatDay(day.date), value: day.label });
            return (
              <li
                key={day.date}
                className={styles.slot}
                aria-label={description}
                title={description}
                onMouseEnter={() => setActiveDate(day.date)}
              >
                <span className={day.date === activeDate ? `${styles.bar} ${styles.isActive}` : styles.bar} style={height} />
              </li>
            );
          })}
        </ol>
      </div>
      {first !== undefined && last !== undefined && (
        <div className={styles.axis} aria-hidden="true">
          <span>{formatDay(first.date)}</span>
          <span>{formatDay(last.date)}</span>
        </div>
      )}
    </figure>
  );
}
