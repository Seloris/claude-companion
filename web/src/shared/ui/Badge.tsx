import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "default" | "attention" | "muted";

export function Badge({ tone = "default", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={tone === "default" ? styles.badge : `${styles.badge} ${styles[tone]}`}>{children}</span>;
}
