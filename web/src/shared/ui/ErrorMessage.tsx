import type { ReactNode } from "react";
import styles from "./ErrorMessage.module.css";

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.error}>
      {children}
    </p>
  );
}
