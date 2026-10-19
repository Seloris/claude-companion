import type { ReactNode } from "react";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import styles from "./LiveColumn.module.css";

export type ColumnTone = "awaiting" | "running" | "finished";

// One column of the board: its icon, title, count and caption, its tiles, or a line saying it is empty (FR-20).
// `isSelected` only matters on a phone, where the board shows the selected column alone (FR-22).
export function LiveColumn({
  id,
  tone,
  icon,
  title,
  caption,
  count,
  emptyLabel,
  isSelected,
  footer,
  children,
}: {
  // The id of the column as the board's tab panel.
  id: string;
  tone: ColumnTone;
  icon: ReactNode;
  title: string;
  caption: string;
  count: number;
  emptyLabel: string;
  isSelected: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={`${id}-title`}
      className={`${styles.column} ${styles[tone]}`}
      data-selected={isSelected}
    >
      <header className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <h2 id={`${id}-title`} className={styles.title}>{title}</h2>
        <span className={styles.count}>{count}</span>
        <p className={styles.caption}>{caption}</p>
      </header>
      {count === 0 ? <EmptyState>{emptyLabel}</EmptyState> : <ul className={styles.tiles}>{children}</ul>}
      {count > 0 && footer}
    </section>
  );
}
