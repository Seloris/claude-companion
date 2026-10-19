import { useId, type ReactNode } from "react";
import styles from "./Field.module.css";

export type FieldControl = { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined };

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children(control: FieldControl): ReactNode;
}) {
  const id = useId();
  const errorId = useId();
  const control: FieldControl = {
    id,
    "aria-invalid": error !== null,
    "aria-describedby": error ? errorId : undefined,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children(control)}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
