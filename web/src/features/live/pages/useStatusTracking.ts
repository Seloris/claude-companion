import { useState } from "react";
import type { BoardSession, Bucket, PillId, TileState } from "../ui/board.ts";

// FR-18: a tile stays highlighted for 8 seconds after its column or pill changed.
export const HIGHLIGHT_MS = 8000;

interface Entry {
  column: Bucket;
  pill: PillId;
  status: BoardSession["status"];
  // FR-15: when the session entered this column, as the first sight of it said.
  enteredAt: string;
  // The time of the read that showed the change; null while the column and the pill are the ones first seen.
  changedAt: number | null;
}

export interface StatusChange {
  sessionId: string;
  title: string;
  pill: PillId;
}

interface Tracked {
  updatedAt: number;
  entries: Map<string, Entry>;
  changes: StatusChange[];
}

const NOTHING_TRACKED: Tracked = { updatedAt: 0, entries: new Map(), changes: [] };

// A session first seen enters its column at its `statusSince`; one already seen keeps its entry while its column and pill
// stay. A change is a change only for a session seen before: the first sight of the page or of a session is not one.
// A column change that comes with a status change enters at the new `statusSince`; one without (BR-20: the factory phase
// moved, not the live status) enters at the read that showed it, since `statusSince` is older than the move.
function advance(
  previous: Tracked,
  sessions: BoardSession[],
  updatedAt: number,
  stateOf: (session: BoardSession) => TileState,
): Tracked {
  const entries = new Map<string, Entry>();
  const changes: StatusChange[] = [];
  for (const session of sessions) {
    const { column, pill } = stateOf(session);
    const before = previous.entries.get(session.sessionId);
    if (before === undefined) {
      entries.set(session.sessionId, { column, pill, status: session.status, enteredAt: session.statusSince, changedAt: null });
    } else if (before.column === column && before.pill === pill) {
      entries.set(session.sessionId, before);
    } else if (before.column === "finished" && column === "idle" && before.status === session.status) {
      // FR-17: a Clôturer moved it, not the live state: the move is no change to highlight or announce.
      entries.set(session.sessionId, { ...before, column, pill });
    } else {
      const enteredAt =
        before.column === column
          ? before.enteredAt
          : before.status === session.status
            ? new Date(updatedAt).toISOString()
            : session.statusSince;
      entries.set(session.sessionId, { column, pill, status: session.status, enteredAt, changedAt: updatedAt });
      changes.push({ sessionId: session.sessionId, title: session.title, pill });
    }
  }
  return { updatedAt, entries, changes };
}

// Keeps, per session, the column and pill it was last seen with and since when it is in that column (FR-15), and which
// ones just changed (FR-18). It moves once per read of the live state (`dataUpdatedAt`), never on the page's one-second
// `now`; the state is adjusted during render, so a StrictMode double render or a tick changes nothing. `sessions` is
// every live session, never a filtered list, and null for a read that cannot be trusted (unreadable folder): the entries
// are kept then. `stateOf` gives a session's column and pill (the page's `tileState` with its Clôturée marks).
export function useStatusTracking(
  sessions: BoardSession[] | null,
  dataUpdatedAt: number,
  now: Date,
  stateOf: (session: BoardSession) => TileState,
) {
  const [tracked, setTracked] = useState(NOTHING_TRACKED);
  let current = tracked;
  if (dataUpdatedAt !== tracked.updatedAt) {
    current =
      sessions === null
        ? { ...tracked, updatedAt: dataUpdatedAt, changes: [] }
        : advance(tracked, sessions, dataUpdatedAt, stateOf);
    setTracked(current);
  }

  return {
    // A session the tracking has not seen yet (it cannot be, after a read) falls back to its own `statusSince`.
    enteredAt: (session: BoardSession) => current.entries.get(session.sessionId)?.enteredAt ?? session.statusSince,
    isHighlighted: (session: BoardSession) => {
      const changedAt = current.entries.get(session.sessionId)?.changedAt ?? null;
      return changedAt !== null && now.getTime() - changedAt < HIGHLIGHT_MS;
    },
    changes: current.changes,
  };
}
