import { useCallback, useEffect, useState } from "react";

// BR-10: `{ [sessionId]: turnStartedAt }`, in this browser only.
const STORAGE_KEY = "claude-companion.live.seen";

type Marks = Record<string, string>;

interface Markable {
  sessionId: string;
  turnStartedAt: string | null;
}

// Storage can be missing, full or blocked: every access is guarded, and without it the marks last until the page is left.
function readMarks(): Marks {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function writeMarks(marks: Marks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Nothing to do: the marks stay in memory.
  }
}

// BR-10: a `Vu` mark covers one turn: a session is seen while its mark equals its current `turnStartedAt`.
export function useSeenMarks() {
  const [marks, setMarks] = useState(readMarks);

  const isSeen = useCallback(
    (session: Markable) => session.turnStartedAt !== null && marks[session.sessionId] === session.turnStartedAt,
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

  const markSeen = useCallback(
    (sessions: Markable[]) => {
      const next = { ...marks, ...readMarks() };
      for (const session of sessions) {
        if (session.turnStartedAt !== null) next[session.sessionId] = session.turnStartedAt;
      }
      setMarks(next);
      writeMarks(next);
    },
    [marks],
  );

  // Forgets the sessions that are no longer live. The caller passes the ids of a full, readable read, never a filtered
  // list and never a failed one, so that a workspace filter or a bad poll does not wipe the marks.
  const prune = useCallback((liveIds: Set<string>) => {
    const keepLive = (marks: Marks): Marks =>
      Object.fromEntries(Object.entries(marks).filter(([sessionId]) => liveIds.has(sessionId)));
    const stored = readMarks();
    const prunedStored = keepLive(stored);
    if (Object.keys(prunedStored).length !== Object.keys(stored).length) writeMarks(prunedStored);
    setMarks((current) => {
      const next = keepLive(current);
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, []);

  return { isSeen, markSeen, prune };
}
