import { t } from "../../../shared/lib/i18n/index.ts";
import type { PromptSwitches } from "../../../shared/lib/promptSwitches.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import type { BoardSession, TileState } from "./board.ts";
import styles from "./CompactBoard.module.css";
import { CompactSessionLine } from "./CompactSessionLine.tsx";
import { COLUMN_IDS, type ColumnId } from "./LiveBoard.tsx";
import { ColumnHeading } from "./LiveColumn.tsx";

// FR-39: the compact mode, one line per session, grouped under the three columns' headings in the board's order, each
// with its count; `Terminées` with `Tout clôturer`; an empty group says so (FR-20). On a phone it stays one list.
export function CompactBoard({
  columns,
  now,
  isHighlighted,
  stateOf,
  switches,
  onClose,
  onCloseAll,
}: {
  columns: Record<ColumnId, BoardSession[]>;
  now: Date;
  isHighlighted: (session: BoardSession) => boolean;
  stateOf: (session: BoardSession) => TileState;
  switches: PromptSwitches;
  onClose: (session: BoardSession) => void;
  onCloseAll: () => void;
}) {
  return (
    <div className={styles.board}>
      {COLUMN_IDS.map((id) => (
        <section key={id} className={styles.section} aria-labelledby={`live-compact-${id}`}>
          <ColumnHeading
            id={`live-compact-${id}`}
            tone={id}
            title={t(`live.column.${id}.title`)}
            count={columns[id].length}
            action={
              id === "finished" && columns[id].length > 0 ? (
                <Button onClick={onCloseAll}>{t("live.column.closeAll")}</Button>
              ) : undefined
            }
          />
          {columns[id].length === 0 ? (
            <EmptyState>{t(`live.column.${id}.empty`)}</EmptyState>
          ) : (
            <ul className={styles.lines}>
              {columns[id].map((session) => (
                <CompactSessionLine
                  key={session.sessionId}
                  session={session}
                  state={stateOf(session)}
                  now={now}
                  isHighlighted={isHighlighted(session)}
                  switches={switches}
                  onClose={() => onClose(session)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
