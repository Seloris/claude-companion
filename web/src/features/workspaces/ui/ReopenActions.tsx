import { t } from "../../../shared/lib/i18n/index.ts";
import { useClipboard } from "../../../shared/lib/useClipboard.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { ButtonLink } from "../../../shared/ui/ButtonLink.tsx";
import { CopyIcon, DesktopIcon } from "../../../shared/ui/icons.tsx";
import type { ReopenAction } from "../data/useReopenAction.ts";
import styles from "./ReopenActions.module.css";

// The copy state lives in its own component: it is mounted only while the session offers the command, so a failure or a
// confirmation never comes back after the session was live in between (BR-15).
function ResumeButton({ command, title }: { command: string; title: string }) {
  const { state, copy } = useClipboard();
  return (
    <div className={styles.actions}>
      <Button aria-label={t("session.reopen.copyLabel", { title })} onClick={() => void copy(command)}>
        <CopyIcon />
        {t("session.reopen.copy")}
      </Button>
      {/* One region that stays mounted, so that a screen reader announces the change of its text. */}
      <p role="status" className={styles.line}>
        {state === "copied" && t("session.reopen.copied")}
        {state === "failed" && t("session.reopen.copyFailed")}
      </p>
      {state === "failed" && <pre className={styles.command}>{command}</pre>}
    </div>
  );
}

// FR-16: the link that opens the session in the desktop app. FR-17: the button that copies its resume command, with
// FR-18's confirmation, or the command to copy by hand when the clipboard is refused.
export function ReopenActions({ action, title }: { action: ReopenAction; title: string }) {
  if (action.kind === "none") return null;
  if (action.kind === "desktop") {
    return (
      <div className={styles.actions}>
        <ButtonLink href={action.href} aria-label={t("session.reopen.desktopLabel", { title })}>
          <DesktopIcon />
          {t("session.reopen.desktop")}
        </ButtonLink>
      </div>
    );
  }
  return <ResumeButton command={action.command} title={title} />;
}
