import { useCallback, useEffect, useState } from "react";

// BR-10: the Clôturée marks, in this browser only, made on the live page and honoured by the factory board's Activité (factory-board BR-04).
// The key predates `Clôturer` (it was `Vu`) and is kept so that the marks already made stay.
const STORAGE_KEY = "claude-companion.live.seen";

// BR-10: a mark is forgotten a month after it was made.
export const CLOSED_MARK_TTL_MS = 30 * 24 * 60 * 60_000;

// `{ closedAt }` is a mark made by `Clôturer`. A string is a legacy `Vu` mark: the `turnStartedAt` of the turn it closed.
type StoredMark = { closedAt: string } | string;
type Marks = Record<string, StoredMark>;

// What a mark is checked against: the end of the session's latest turn (null when it has none), and for the legacy
// marks only, the start of that turn.
export interface Closable {
  sessionId: string;
  turnEndedAt: string | null;
  turnStartedAt?: string | null;
}

function markTime(mark: StoredMark): number {
  return new Date(typeof mark === "string" ? mark : mark.closedAt).getTime();
}

function isStoredMark(value: unknown): value is StoredMark {
  if (typeof value === "string") return true;
  return (
    typeof value === "object" && value !== null && "closedAt" in value && typeof value.closedAt === "string"
  );
}

function writeMarks(marks: Marks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Nothing to do: the marks stay in memory.
  }
}

// Storage can be missing, full or blocked: every access is guarded, and without it the marks last until the page is left.
// The marks that cannot be read, or that are older than a month, are dropped and the rest is written back.
function readMarks(): Marks {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed);
    const limit = Date.now() - CLOSED_MARK_TTL_MS;
    const kept = entries.filter((entry): entry is [string, StoredMark] => {
      if (!isStoredMark(entry[1])) return false;
      const time = markTime(entry[1]);
      return !Number.isNaN(time) && time >= limit;
    });
    if (kept.length !== entries.length) writeMarks(Object.fromEntries(kept));
    return Object.fromEntries(kept);
  } catch {
    return {};
  }
}

// BR-10: a `Clôturée` mark covers the turns ended before it: a session is closed while its latest turn ended at or
// before the mark. A session that runs a new turn ends it after the mark and is `Terminée` again.
export function useClosedMarks() {
  const [marks, setMarks] = useState(readMarks);

  const isClosed = useCallback(
    (session: Closable) => {
      const mark = marks[session.sessionId];
      if (mark === undefined || session.turnEndedAt === null) return false;
      if (typeof mark === "string") {
        // A newer turn starts after the old one ended, so it is not covered.
        return session.turnStartedAt != null && new Date(session.turnStartedAt).getTime() <= new Date(mark).getTime();
      }
      return new Date(session.turnEndedAt).getTime() <= new Date(mark.closedAt).getTime();
    },
    [marks],
  );

  // Another tab of the same browser writes the same storage: a mark it made shows here, and the writes below merge
  // onto what the storage holds, so that one tab never wipes the marks of another.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setMarks(readMarks());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const close = useCallback(
    (sessions: Closable[]) => {
      const now = Date.now();
      // The marks of memory that a month has expired are not put back.
      const unexpired = Object.entries(marks).filter(([, mark]) => markTime(mark) >= now - CLOSED_MARK_TTL_MS);
      const next: Marks = { ...Object.fromEntries(unexpired), ...readMarks() };
      for (const session of sessions) {
        if (session.turnEndedAt === null) continue;
        // Raised to the turn's end when that is later (both clocks are this machine's), so the turn is always covered.
        const closedAt = Math.max(now, new Date(session.turnEndedAt).getTime());
        next[session.sessionId] = { closedAt: new Date(closedAt).toISOString() };
      }
      setMarks(next);
      writeMarks(next);
    },
    [marks],
  );

  return { isClosed, close };
}
