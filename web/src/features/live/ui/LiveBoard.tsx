import { t } from "../../../shared/lib/i18n/index.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { Tabs, tabPanelId } from "../../../shared/ui/Tabs.tsx";
import type { BoardSession } from "./board.ts";
import styles from "./LiveBoard.module.css";
import { LiveColumn, type ColumnTone } from "./LiveColumn.tsx";
import { LiveSessionTile } from "./LiveSessionTile.tsx";
import { StatusIcon } from "./StatusPill.tsx";

export type ColumnId = ColumnTone;

const COLUMN_IDS: ColumnId[] = ["awaiting", "running", "finished"];
const TABS_ID = "live-board";

// FR-01: the three columns, `Question posée` first. FR-22: below 768 px a tab list picks the one column shown.
export function LiveBoard({
  columns,
  now,
  selected,
  isHighlighted,
  onSelect,
  onMarkSeen,
  onMarkAllSeen,
}: {
  columns: Record<ColumnId, BoardSession[]>;
  now: Date;
  selected: ColumnId;
  isHighlighted: (session: BoardSession) => boolean;
  onSelect: (id: ColumnId) => void;
  onMarkSeen: (session: BoardSession) => void;
  onMarkAllSeen: () => void;
}) {
  return (
    <div className={styles.board}>
      <div className={styles.tabs}>
        <Tabs
          id={TABS_ID}
          label={t("live.board.tabs")}
          items={COLUMN_IDS.map((id) => ({ id, label: t(`live.column.${id}.title`), count: columns[id].length }))}
          selected={selected}
          onSelect={(id) => onSelect(id as ColumnId)}
        />
      </div>
      <div className={styles.columns}>
        {COLUMN_IDS.map((id) => (
          <LiveColumn
            key={id}
            id={tabPanelId(TABS_ID, id)}
            tone={id}
            icon={<StatusIcon status={id} />}
            title={t(`live.column.${id}.title`)}
            caption={t(`live.column.${id}.caption`)}
            count={columns[id].length}
            emptyLabel={t(`live.column.${id}.empty`)}
            isSelected={id === selected}
            footer={id === "finished" ? <Button onClick={onMarkAllSeen}>{t("live.column.markAllSeen")}</Button> : undefined}
          >
            {columns[id].map((session) => (
              <li key={session.sessionId}>
                <LiveSessionTile
                  session={session}
                  kind={id}
                  now={now}
                  isHighlighted={isHighlighted(session)}
                  onMarkSeen={() => onMarkSeen(session)}
                />
              </li>
            ))}
          </LiveColumn>
        ))}
      </div>
    </div>
  );
}
