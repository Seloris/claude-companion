import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import styles from "./Dialog.module.css";
import { CloseIcon } from "./icons.tsx";

// A modal container, shown while mounted: the page mounts it to open it and unmounts it once `onClose` has run.
export function Dialog({
  title,
  closeLabel,
  actions,
  children,
  onClose,
}: {
  title: ReactNode;
  closeLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Escape, the native close, the button and an outside click may follow each other before the page unmounts the
  // dialog: the page hears one close per opening, never two (a second one would navigate twice).
  const hasClosed = useRef(false);
  // An outside click starts and ends on the dialog element: a text selection released over the backdrop is not one.
  const isPressedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    // Guarded: StrictMode runs effects twice, and showModal() throws on an open dialog. No close() in a cleanup: its
    // asynchronous close event would land after StrictMode's re-mount and close the dialog it just opened.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    if (hasClosed.current) return;
    hasClosed.current = true;
    onClose();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: the page closes it, by unmounting it.
        event.preventDefault();
        close();
      }}
      // The browser may still close it (a repeated Escape cannot be prevented).
      onClose={close}
      onPointerDown={(event) => {
        isPressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The dialog has no padding of its own: a click on the element itself is a click on the backdrop. Escape is the
        // keyboard's way out.
        const wasPressedOutside = isPressedOutside.current;
        isPressedOutside.current = false;
        if (wasPressedOutside && event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.frame}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div className={styles.actions}>
            {actions}
            <Button variant="quiet" aria-label={closeLabel} title={closeLabel} onClick={close}>
              <CloseIcon />
            </Button>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
