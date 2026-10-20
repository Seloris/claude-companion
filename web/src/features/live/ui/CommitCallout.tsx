import { t } from "../../../shared/lib/i18n/index.ts";
import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import { useClipboard } from "../../../shared/lib/useClipboard.ts";
import { CopyIcon } from "../../../shared/ui/icons.tsx";
import styles from "./CommitCallout.module.css";
import { openDesktopLink } from "./openDesktopLink.ts";
import text from "./texts.module.css";

// FR-36: the commit the session's job proposes, its subject only, as one button that copies the subject and then, once
// copied, opens the session in the desktop app. A session without a desktop link only copies, and the button says so
// (BR-18). A failed copy opens nothing and shows the subject to select by hand. `isCompact` (FR-40): the button alone.
export function CommitCallout({
  subject,
  desktopLink,
  title,
  isCompact = false,
}: {
  subject: string;
  desktopLink: string | null;
  // The session's title, for the button's accessible name.
  title: string;
  isCompact?: boolean;
}) {
  const clipboard = useClipboard();
  const hasLink = desktopLink !== null && isDesktopLink(desktopLink);
  const action = t(hasLink ? "live.commit.copyAndOpen" : "live.commit.copyOnly");

  async function copyAndOpen() {
    if (await clipboard.copy(subject)) openDesktopLink(hasLink ? desktopLink : null);
  }

  const button = (
    <button
      type="button"
      className={isCompact ? `${styles.button} ${styles.compactButton}` : styles.button}
      aria-label={`${action} : ${subject} (${title})`}
      title={isCompact ? `${subject}\n${action}` : undefined}
      onClick={() => void copyAndOpen()}
    >
      {isCompact ? (
        <>
          <CopyIcon />
          <span className={styles.compactSubject}>{subject}</span>
        </>
      ) : (
        <>
          <span className={styles.subject}>{subject}</span>
          <span className={styles.action}>
            <CopyIcon />
            {action}
          </span>
        </>
      )}
    </button>
  );

  const feedback = (
    <>
      <span className={`${styles.status} ${text.muted}`} role="status">
        {clipboard.state === "copied" && t("live.commit.copied")}
        {clipboard.state === "failed" && t("live.commit.copyFailed")}
      </span>
      {clipboard.state === "failed" && <pre className={styles.fallback}>{subject}</pre>}
    </>
  );

  if (isCompact) {
    return (
      <span className={styles.compact}>
        {button}
        {feedback}
      </span>
    );
  }
  return (
    <div className={styles.callout} role="group" aria-label={t("live.commit.heading")}>
      <span className={styles.heading}>{t("live.commit.heading")}</span>
      {button}
      {feedback}
    </div>
  );
}
