import type { components } from "../../../api/schema.d.ts";
import type { Closable } from "../../../shared/lib/useClosedMarks.ts";

type LiveState = components["schemas"]["LiveState"];
type LiveSession = components["schemas"]["LiveSession"];

export interface BoardWorkspace {
  key: string;
  name: string;
  isScratch: boolean;
}

// A live session with the workspace it belongs to: the board reads sessions, not workspaces.
export interface BoardSession extends LiveSession {
  workspace: BoardWorkspace;
}

export type Bucket = "awaiting" | "running" | "finished" | "idle";

export interface BoardColumns {
  awaiting: BoardSession[];
  running: BoardSession[];
  finished: BoardSession[];
  idle: BoardSession[];
}

export interface WorkspaceChoice extends BoardWorkspace {
  count: number;
}

export function flattenWorkspaces(state: LiveState): BoardSession[] {
  return state.workspaces.flatMap((workspace) => {
    const { key, name, isScratch } = workspace;
    return workspace.sessions.map((session) => ({ ...session, workspace: { key, name, isScratch } }));
  });
}

// The end of the session's latest turn: `statusSince` while it is `Idle` with a turn since the process started.
// A last prompt newer than the moment the session became idle started no turn (a built-in command such as /model
// answers at once and leaves the status as it is): there is no finished turn to show.
export function turnEndedAt(session: BoardSession): string | null {
  if (session.status !== "idle" || session.turnStartedAt === null) return null;
  if (new Date(session.turnStartedAt).getTime() > new Date(session.statusSince).getTime()) return null;
  return session.statusSince;
}

export function toClosable(session: BoardSession): Closable {
  return { sessionId: session.sessionId, turnEndedAt: turnEndedAt(session), turnStartedAt: session.turnStartedAt };
}

// BR-09: an `Idle` session with a finished turn stays `Terminée` until it is closed, however long ago the turn ended.
export function bucketOf(session: BoardSession, { isClosed }: { isClosed: (session: Closable) => boolean }): Bucket {
  if (session.status === "awaitingAnswer") return "awaiting";
  if (session.status === "running") return "running";
  if (turnEndedAt(session) === null) return "idle";
  return isClosed(toClosable(session)) ? "idle" : "finished";
}

function compareBy(time: (session: BoardSession) => string, direction: 1 | -1) {
  return (a: BoardSession, b: BoardSession) => {
    const byTime = (new Date(time(a)).getTime() - new Date(time(b)).getTime()) * direction;
    if (byTime !== 0) return byTime;
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  };
}

// FR-15: `Question posée` and `En cours` by the time the session entered the state, oldest first; `Terminées`
// and the idle group most recent first. Ties are broken by session id, so that the order never depends on the api's.
export function buildColumns(
  sessions: BoardSession[],
  { isClosed, enteredAt }: { isClosed: (session: Closable) => boolean; enteredAt: (session: BoardSession) => string },
): BoardColumns {
  const columns: BoardColumns = { awaiting: [], running: [], finished: [], idle: [] };
  for (const session of sessions) columns[bucketOf(session, { isClosed })].push(session);
  columns.awaiting.sort(compareBy(enteredAt, 1));
  columns.running.sort(compareBy(enteredAt, 1));
  columns.finished.sort(compareBy((session) => session.statusSince, -1));
  columns.idle.sort(compareBy((session) => session.statusSince, -1));
  return columns;
}

// FR-19: one choice per workspace with its number of sessions, in the order the workspaces come.
export function workspaceChoices(sessions: BoardSession[]): WorkspaceChoice[] {
  const choices = new Map<string, WorkspaceChoice>();
  for (const { workspace } of sessions) {
    const choice = choices.get(workspace.key);
    if (choice === undefined) choices.set(workspace.key, { ...workspace, count: 1 });
    else choice.count += 1;
  }
  return [...choices.values()];
}
