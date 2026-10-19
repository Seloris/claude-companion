import { useState } from "react";
import type { BoardSession } from "../ui/board.ts";

// FR-18: a tile stays highlighted for 8 seconds after its status changed.
export const HIGHLIGHT_MS = 8000;

type Status = BoardSession["status"];

interface Entry {
  status: Status;
  // FR-15: when the session entered this status, as the first sight of it said.
  enteredAt: string;
  // The time of the read that showed the change; null while the status is the one first seen.
  changedAt: number | null;
}

export interface StatusChange {
  sessionId: string;
  title: string;
  status: Status;
}

interface Tracked {
  updatedAt: number;
  entries: Map<string, Entry>;
  changes: StatusChange[];
}

const NOTHING_TRACKED: Tracked = { updatedAt: 0, entries: new Map(), changes: [] };

// A session first seen enters its status at its `statusSince`; one already seen keeps its entry while the status stays.
// A status change is a change only for a session seen before: the first sight of the page or of a session is not one.
function advance(previous: Tracked, sessions: BoardSession[], updatedAt: number): Tracked {
  const entries = new Map<string, Entry>();
  const changes: StatusChange[] = [];
  for (const session of sessions) {
    const before = previous.entries.get(session.sessionId);
    if (before === undefined) {
      entries.set(session.sessionId, { status: session.status, enteredAt: session.statusSince, changedAt: null });
    } else if (before.status === session.status) {
      entries.set(session.sessionId, before);
    } else {
      entries.set(session.sessionId, { status: session.status, enteredAt: session.statusSince, changedAt: updatedAt });
      changes.push({ sessionId: session.sessionId, title: session.title, status: session.status });
    }
  }
  return { updatedAt, entries, changes };
}

// Keeps, per session, the status it was last seen in and since when (FR-15), and which ones just changed (FR-18).
// It moves once per read of the live state (`dataUpdatedAt`), never on the page's one-second `now`; the state is
// adjusted during render, so a StrictMode double render or a tick changes nothing. `sessions` is every live session,
// never a filtered list, and null for a read that cannot be trusted (unreadable folder): the entries are kept then.
export function useStatusTracking(sessions: BoardSession[] | null, dataUpdatedAt: number, now: Date) {
  const [tracked, setTracked] = useState(NOTHING_TRACKED);
  let current = tracked;
  if (dataUpdatedAt !== tracked.updatedAt) {
    current = sessions === null ? { ...tracked, updatedAt: dataUpdatedAt, changes: [] } : advance(tracked, sessions, dataUpdatedAt);
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
