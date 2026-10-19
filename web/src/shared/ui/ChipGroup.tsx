import type { CSSProperties } from "react";
import styles from "./ChipGroup.module.css";

export interface ChipItem {
  // `null` is the "everything" choice.
  id: string | null;
  label: string;
  count?: number;
  // A CSS color (a variable) for the dot before the label.
  color?: string;
}

// A group of toggle buttons that picks one item; the pressed one is told by `aria-pressed`.
export function ChipGroup({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: ChipItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id ?? ""}
          type="button"
          aria-pressed={item.id === selected}
          className={styles.chip}
          onClick={() => onSelect(item.id)}
        >
          {item.color !== undefined && (
            <span className={styles.dot} style={{ "--chip-color": item.color } as CSSProperties} aria-hidden="true" />
          )}
          <span className={styles.label}>{item.label}</span>
          {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
