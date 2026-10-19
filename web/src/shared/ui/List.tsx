import type { ReactNode } from "react";
import styles from "./List.module.css";

export function List({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

export function ListItem({ isDone = false, children }: { isDone?: boolean; children: ReactNode }) {
  return <li className={isDone ? `${styles.item} ${styles.isDone}` : styles.item}>{children}</li>;
}

export function ListItemText({ children }: { children: ReactNode }) {
  return <span className={styles.itemText}>{children}</span>;
}
