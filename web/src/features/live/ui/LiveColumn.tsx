import type { ReactNode } from "react";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import styles from "./LiveColumn.module.css";

export type ColumnTone = "awaiting" | "running" | "finished";

// One column of the board: its count in a bubble of its tone, its title and its action on the right, its tiles, or a line
// saying it is empty (FR-20). `isSelected` only matters on a phone, where the board shows the selected column alone (FR-22).
export function LiveColumn({
  id,
  tone,
  title,
  count,
  emptyLabel,
  isSelected,
  action,
  children,
}: {
  // The id of the column as the board's tab panel.
  id: string;
  tone: ColumnTone;
  title: string;
  count: number;
  emptyLabel: string;
  isSelected: boolean;
  // Shown in the header while the column has tiles (`Tout clôturer`).
  action?: ReactNode;
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
      <ColumnHeading id={`${id}-title`} tone={tone} title={title} count={count} action={count > 0 ? action : undefined} />
      {count === 0 ? <EmptyState>{emptyLabel}</EmptyState> : <ul className={styles.tiles}>{children}</ul>}
    </section>
  );
}

// The heading of a column, shared by the board and the compact mode (FR-39): the count bubble, the title, the action.
export function ColumnHeading({
  id,
  tone,
  title,
  count,
  action,
}: {
  id?: string;
  tone: ColumnTone;
  title: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <header className={`${styles.header} ${styles[tone]}`}>
      <span className={styles.count}>{count}</span>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {action !== undefined && <span className={styles.action}>{action}</span>}
    </header>
  );
}
