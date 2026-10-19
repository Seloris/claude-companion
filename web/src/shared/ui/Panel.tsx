import type { ReactNode } from "react";
import styles from "./Panel.module.css";

export function Panel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}
