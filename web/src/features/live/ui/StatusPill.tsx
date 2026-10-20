import { CheckIcon } from "../../../shared/ui/icons.tsx";
import type { PillId } from "./board.ts";
import styles from "./StatusPill.module.css";

const TONES: Record<PillId, "working" | "attention" | "done" | "finished" | "muted"> = {
  working: "working",
  running: "working",
  "awaiting-commit": "attention",
  "awaiting-answer": "attention",
  awaitingAnswer: "attention",
  "job-done": "done",
  finished: "finished",
  interrupted: "muted",
  idle: "muted",
};

// FR-32: the pill of a tile, its factory phase or its live status. A pulsing dot while it works (the pulse stops under
// prefers-reduced-motion), a check once the job is done, a dot for what waits or finished, nothing for a muted state.
export function StatusPill({ pill, label }: { pill: PillId; label: string }) {
  const tone = TONES[pill];
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      {tone === "done" ? <CheckIcon /> : tone !== "muted" && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </span>
  );
}
