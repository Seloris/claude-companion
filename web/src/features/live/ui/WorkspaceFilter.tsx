import { t } from "../../../shared/lib/i18n/index.ts";
import { ChipGroup } from "../../../shared/ui/ChipGroup.tsx";
import type { WorkspaceChoice } from "./board.ts";
import { workspaceColorVar } from "./workspaceColor.ts";

// FR-19: every workspace by default, or one choice per workspace with its number of sessions.
export function WorkspaceFilter({
  choices,
  total,
  selected,
  onSelect,
}: {
  choices: WorkspaceChoice[];
  total: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <ChipGroup
      label={t("live.filter.label")}
      items={[
        { id: null, label: t("live.filter.all"), count: total },
        ...choices.map((choice) => ({
          id: choice.key,
          label: choice.name,
          count: choice.count,
          color: workspaceColorVar(choice),
        })),
      ]}
      selected={selected}
      onSelect={onSelect}
    />
  );
}
