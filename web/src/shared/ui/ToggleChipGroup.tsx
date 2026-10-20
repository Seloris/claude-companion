import type { CSSProperties } from "react";
import styles from "./ChipGroup.module.css";

export interface ToggleChipItem {
  id: string;
  label: string;
  count?: number;
  // A CSS color (a variable) for the dot before the label.
  color?: string;
}

// A group of toggle buttons where several can be pressed at once; none pressed means "everything", which the first chip
// says and clears. ChipGroup picks exactly one item and stays as it is.
export function ToggleChipGroup({
  label,
  items,
  selected,
  onToggle,
  allLabel,
  onClear,
}: {
  label: string;
  items: ToggleChipItem[];
  selected: string[];
  onToggle: (id: string) => void;
  allLabel: string;
  onClear: () => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <button type="button" aria-pressed={selected.length === 0} className={styles.chip} onClick={onClear}>
        <span className={styles.label}>{allLabel}</span>
      </button>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selected.includes(item.id)}
          className={styles.chip}
          onClick={() => onToggle(item.id)}
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
