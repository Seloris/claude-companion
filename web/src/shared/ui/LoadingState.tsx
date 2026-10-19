import type { ReactNode } from "react";
import styles from "./LoadingState.module.css";

export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className={styles.loading}>
      {children}
    </p>
  );
}
