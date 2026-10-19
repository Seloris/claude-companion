import type { ReactNode } from "react";
import styles from "./Disclosure.module.css";
import { ChevronIcon } from "./icons.tsx";

// A native <details>: closed until the person opens it, and it stays as they left it when the page re-renders.
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={styles.disclosure}>
      <summary className={styles.summary}>
        <span className={styles.chevron}>
          <ChevronIcon />
        </span>
        {summary}
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
