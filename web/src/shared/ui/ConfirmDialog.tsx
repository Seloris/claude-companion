import { useEffect, useRef } from "react";
import { Button } from "./Button.tsx";
import styles from "./ConfirmDialog.module.css";
import { ErrorMessage } from "./ErrorMessage.tsx";

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isPending,
  error,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isPending: boolean;
  error: string | null;
  onConfirm(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Guarded: StrictMode runs effects twice, and showModal() throws on an open dialog.
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  });

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        // Escape: the page decides whether the dialog closes; never while the action runs.
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      // The browser may still close it (a repeated Escape cannot be prevented): the page decides, and the
      // effect, run on every render, opens it again if the page keeps it open (a failed action shows its error).
      onClose={() => {
        if (isOpen) onCancel();
      }}
    >
      <h2 id="confirm-dialog-title">{title}</h2>
      <p>{message}</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className={styles.actions}>
        <Button variant="quiet" onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={isPending}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
