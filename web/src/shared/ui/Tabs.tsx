import type { KeyboardEvent } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: string;
  count: number;
}

// The ids the tab and the panel it controls share, so that the page can give them to the panel.
export function tabId(tabsId: string, itemId: string): string {
  return `${tabsId}-tab-${itemId}`;
}

export function tabPanelId(tabsId: string, itemId: string): string {
  return `${tabsId}-panel-${itemId}`;
}

// A row of tabs, each with its count; the selected one is told by `aria-selected` and is the only one in the Tab order,
// the arrow keys move between them. The panel each tab controls is the page's: it takes `tabPanelId` as its id.
export function Tabs({
  id,
  label,
  items,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  items: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = items[(target + items.length) % items.length];
    if (next === undefined) return;
    onSelect(next.id);
    // Focus follows the selection, as the pattern asks.
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[(target + items.length) % items.length]?.focus();
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          id={tabId(id, item.id)}
          type="button"
          role="tab"
          aria-selected={item.id === selected}
          aria-controls={tabPanelId(id, item.id)}
          tabIndex={item.id === selected ? 0 : -1}
          className={styles.tab}
          onClick={() => onSelect(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <span>{item.label}</span>
          <span className={styles.count}>{item.count}</span>
        </button>
      ))}
    </div>
  );
}
