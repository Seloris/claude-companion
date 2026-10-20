import { t } from "../../../shared/lib/i18n/index.ts";
import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import type { PromptSwitches } from "../../../shared/lib/promptSwitches.ts";
import { useClipboard } from "../../../shared/lib/useClipboard.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { CopyIcon } from "../../../shared/ui/icons.tsx";
import type { FactorySessionJob } from "../../factory/data/factoryTypes.ts";
import { promptsOf } from "../../factory/ui/prompts.ts";
import styles from "./NextStepButton.module.css";
import { openDesktopLink } from "./openDesktopLink.ts";
import text from "./texts.module.css";

// FR-38: the next step's prompt of the job's feature, with the markers the factory page's switches add (factory-board
// FR-18), copied and then, once copied, the session opened in the desktop app; a session without a desktop link only
// copies, and the button says so. Nothing when the feature has no next step. `isCompact` (FR-40): the step's name alone.
export function NextStepButton({
  job,
  switches,
  desktopLink,
  isCompact = false,
}: {
  job: FactorySessionJob;
  switches: PromptSwitches;
  desktopLink: string | null;
  isCompact?: boolean;
}) {
  const clipboard = useClipboard();
  const next = job.feature?.next ?? null;
  const prompt = promptsOf(next, job.markers, switches).prompts[0];
  if (next === null || prompt === undefined) return null;

  const hasLink = desktopLink !== null && isDesktopLink(desktopLink);
  const label = isCompact ? next.label : t("live.next.label", { step: next.label });
  const description = t(hasLink ? "live.next.copyAndOpen" : "live.next.copyOnly", { step: next.label });

  async function copyAndOpen(value: string) {
    if (await clipboard.copy(value)) openDesktopLink(hasLink ? desktopLink : null);
  }

  return (
    <span className={styles.next}>
      {/* The accessible name starts with the visible label (WCAG 2.5.3), then says what the click does. */}
      <Button aria-label={`${label} — ${description}`} title={description} onClick={() => void copyAndOpen(prompt.prompt)}>
        <CopyIcon />
        {label}
      </Button>
      <span className={`${styles.status} ${text.muted}`} role="status">
        {clipboard.state === "copied" && t("live.next.copied")}
        {clipboard.state === "failed" && t("live.next.copyFailed")}
      </span>
      {clipboard.state === "failed" && <pre className={styles.fallback}>{prompt.prompt}</pre>}
    </span>
  );
}
