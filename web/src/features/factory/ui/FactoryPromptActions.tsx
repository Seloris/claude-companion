import { useState } from "react";
import { t } from "../../../shared/lib/i18n/index.ts";
import { useClipboard } from "../../../shared/lib/useClipboard.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { CopyIcon } from "../../../shared/ui/icons.tsx";
import { Switch } from "../../../shared/ui/Switch.tsx";
import type { FactoryBoard, FactoryFeature } from "../data/factoryTypes.ts";
import styles from "./FactoryPromptActions.module.css";
import { promptsOf } from "./prompts.ts";

// FR-17, FR-18: the prompts of the step at hand, each a button that copies it, and the two switches that add the mod's markers.
export function FactoryPromptActions({
  feature,
  markers,
  isReview,
  isBrowser,
  onReviewChange,
  onBrowserChange,
}: {
  feature: FactoryFeature;
  markers: FactoryBoard["markers"];
  isReview: boolean;
  isBrowser: boolean;
  onReviewChange: (checked: boolean) => void;
  onBrowserChange: (checked: boolean) => void;
}) {
  const clipboard = useClipboard();
  const [lastPrompt, setLastPrompt] = useState("");
  const { prompts, hasReviewSwitch, hasBrowserSwitch } = promptsOf(feature.next, markers, { isReview, isBrowser });

  if (prompts.length === 0) {
    return feature.autopilot === null ? null : <p className={styles.note}>{t("factory.prompt.autopilotRunning")}</p>;
  }

  function copy(prompt: string) {
    setLastPrompt(prompt);
    void clipboard.copy(prompt);
  }

  return (
    <div className={styles.actions}>
      <ul className={styles.prompts}>
        {prompts.map((prompt, index) => (
          <li key={prompt.label} className={styles.prompt}>
            <Button variant={index === 0 ? "primary" : "quiet"} onClick={() => copy(prompt.prompt)}>
              <CopyIcon />
              {prompt.label}
            </Button>
            <code className={styles.code} title={prompt.prompt}>
              {prompt.prompt}
            </code>
          </li>
        ))}
      </ul>
      {(hasReviewSwitch || hasBrowserSwitch) && (
        <div className={styles.switches}>
          {hasReviewSwitch && (
            <Switch label={t("factory.prompt.withReview")} checked={isReview} onChange={onReviewChange} />
          )}
          {hasBrowserSwitch && (
            <Switch label={t("factory.prompt.withBrowser")} checked={isBrowser} onChange={onBrowserChange} />
          )}
        </div>
      )}
      <p role="status" className={styles.note}>
        {clipboard.state === "copied" ? t("factory.prompt.copied") : ""}
      </p>
      {clipboard.state === "failed" && (
        <>
          <p className={styles.note}>{t("factory.prompt.copyFailed")}</p>
          <pre className={styles.fallback}>{lastPrompt}</pre>
        </>
      )}
    </div>
  );
}
