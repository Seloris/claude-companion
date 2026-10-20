import type { ReactNode } from "react";
import styles from "./Banner.module.css";

// A warning strip: something needs the person's attention, nothing is broken. Polite announcement, not an alert.
export function Banner({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={styles.banner}>
      {children}
    </div>
  );
}
