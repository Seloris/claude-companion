import { t } from "../../../shared/lib/i18n/index.ts";
import { Field } from "../../../shared/ui/Field.tsx";
import { Select } from "../../../shared/ui/Select.tsx";
import { Switch } from "../../../shared/ui/Switch.tsx";
import type { DashboardPeriod } from "../data/useDashboardQuery.ts";
import styles from "./DashboardFilters.module.css";

export const PERIODS: DashboardPeriod[] = ["7d", "30d", "90d", "all"];
const ALL_WORKSPACES = "all";

export function DashboardFilters({
  period,
  workspaceId,
  includeScratch,
  workspaces,
  onPeriodChange,
  onWorkspaceChange,
  onScratchChange,
}: {
  period: DashboardPeriod;
  workspaceId: number | null;
  includeScratch: boolean;
  workspaces: { id: number; name: string }[];
  onPeriodChange(period: DashboardPeriod): void;
  onWorkspaceChange(workspaceId: number | null): void;
  onScratchChange(includeScratch: boolean): void;
}) {
  return (
    <div className={styles.filters}>
      <Field label={t("dashboard.filters.period")} error={null}>
        {(control) => (
          <Select
            {...control}
            value={period}
            onChange={(event) => {
              const next = PERIODS.find((candidate) => candidate === event.target.value);
              if (next !== undefined) onPeriodChange(next);
            }}
          >
            {PERIODS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`dashboard.period.${candidate}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("dashboard.filters.workspace")} error={null}>
        {(control) => (
          <Select
            {...control}
            value={workspaceId === null ? ALL_WORKSPACES : String(workspaceId)}
            onChange={(event) =>
              onWorkspaceChange(event.target.value === ALL_WORKSPACES ? null : Number(event.target.value))
            }
          >
            <option value={ALL_WORKSPACES}>{t("dashboard.filters.allWorkspaces")}</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={String(workspace.id)}>
                {workspace.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Switch label={t("dashboard.filters.scratch")} checked={includeScratch} onChange={onScratchChange} />
    </div>
  );
}
