import { CheckIcon, QuestionIcon } from "../../../shared/ui/icons.tsx";
import styles from "./StatusPill.module.css";

export type PillStatus = "awaiting" | "running" | "finished";

// The icon of a status: a pulsing dot while it runs (the pulse stops under prefers-reduced-motion), a question mark, a check.
export function StatusIcon({ status }: { status: PillStatus }) {
  if (status === "running") return <span className={styles.dot} aria-hidden="true" />;
  return status === "awaiting" ? <QuestionIcon /> : <CheckIcon />;
}

export function StatusPill({ status, label }: { status: PillStatus; label: string }) {
  return (
    <span className={`${styles.pill} ${styles[status]}`}>
      <StatusIcon status={status} />
      {label}
    </span>
  );
}
