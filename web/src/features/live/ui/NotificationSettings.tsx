import { t } from "../../../shared/lib/i18n/index.ts";
import { Banner } from "../../../shared/ui/Banner.tsx";
import { Button } from "../../../shared/ui/Button.tsx";
import { Switch } from "../../../shared/ui/Switch.tsx";
import type { NotificationPermissionState } from "../data/notificationPermission.ts";
import type { NotificationSettings as NotificationSettingsValue } from "../data/notificationSettings.ts";
import styles from "./NotificationSettings.module.css";

// FR-23, FR-26, FR-29: asks for the browser's permission, switches each kind on or off, and says why nothing can be
// shown when the browser cannot or will not.
export function NotificationSettings({
  permission,
  settings,
  onEnable,
  onChange,
}: {
  permission: NotificationPermissionState;
  settings: NotificationSettingsValue;
  onEnable(): void;
  onChange(patch: Partial<NotificationSettingsValue>): void;
}) {
  return (
    <section className={styles.settings} aria-labelledby="live-notifications-heading">
      <h2 id="live-notifications-heading" className={styles.heading}>
        {t("live.notify.heading")}
      </h2>
      {permission === "unsupported" && <Banner>{t("live.notify.unsupported")}</Banner>}
      {permission === "denied" && <Banner>{t("live.notify.denied")}</Banner>}
      {permission === "default" && (
        <div className={styles.controls}>
          <Button variant="primary" onClick={onEnable}>
            {t("live.notify.enable")}
          </Button>
          <p className={styles.hint}>{t("live.notify.enableHint")}</p>
        </div>
      )}
      {permission === "granted" && (
        <div className={styles.controls}>
          <Switch
            label={t("live.notify.awaiting")}
            checked={settings.awaiting}
            onChange={(awaiting) => onChange({ awaiting })}
          />
          <Switch
            label={t("live.notify.finished")}
            checked={settings.finished}
            onChange={(finished) => onChange({ finished })}
          />
          <p className={styles.hint}>{t("live.notify.grantedHint")}</p>
        </div>
      )}
    </section>
  );
}
