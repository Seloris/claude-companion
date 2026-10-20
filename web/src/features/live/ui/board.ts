import type { components } from "../../../api/schema.d.ts";
import type { Closable } from "../../../shared/lib/useClosedMarks.ts";
import type { FactoryPhase } from "../../factory/data/factoryTypes.ts";
import { shownPhase } from "../../factory/ui/labels.ts";

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

// FR-32: a tile's pill, its factory phase on a board that is not stale, else its live status (`finished` for a session
// in `Terminées`).
export type PillId =
  | "working"
  | "awaiting-commit"
  | "awaiting-answer"
  | "job-done"
  | "interrupted"
  | "running"
  | "awaitingAnswer"
  | "finished"
  | "idle";

export interface TileState {
  column: Bucket;
  pill: PillId;
}

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

// FR-32, BR-21: the factory phase of the session's job, as the factory page shows it, on a board that is not stale only:
// a frozen board's phase sets no column, pill or callout. Null without a job, or for a run with no phase (an older
// export): the live status is shown then, never a derived phase (BR-02).
export function factoryPhaseOf(session: BoardSession): FactoryPhase | null {
  if (session.factory === null || session.factory.isStale) return null;
  return shownPhase(session.factory.run);
}

// BR-20: a session waits for the person when it asks a question, or when its factory job waits for its commit's validation.
export function isAwaitingPerson(session: BoardSession): boolean {
  return session.status === "awaitingAnswer" || factoryPhaseOf(session) === "awaiting-commit";
}

// FR-36: the subject of the commit the session's job proposes, the first non-empty line of its message, never its body;
// null unless the job waits for that commit's validation on a board that is not stale.
export function commitSubjectOf(session: BoardSession): string | null {
  if (factoryPhaseOf(session) !== "awaiting-commit") return null;
  const message = session.factory?.run.pendingCommit ?? null;
  if (message === null) return null;
  return message.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? null;
}

// BR-09: an `Idle` session with a finished turn stays `Terminée` until it is closed, however long ago the turn ended.
// BR-20: a session waiting for its commit's validation goes in `Vous attend` whatever its live status.
export function bucketOf(session: BoardSession, { isClosed }: { isClosed: (session: Closable) => boolean }): Bucket {
  if (isAwaitingPerson(session)) return "awaiting";
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

// FR-01, FR-32: the column of a tile and its pill.
export function tileState(session: BoardSession, marks: { isClosed: (session: Closable) => boolean }): TileState {
  const column = bucketOf(session, marks);
  return { column, pill: factoryPhaseOf(session) ?? (column === "finished" ? "finished" : session.status) };
}

// FR-14: the navigation's counts, over every live session; neither column depends on the Clôturée marks.
export function columnCounts(sessions: BoardSession[]): { awaiting: number; running: number } {
  let awaiting = 0;
  let running = 0;
  for (const session of sessions) {
    if (isAwaitingPerson(session)) awaiting += 1;
    else if (session.status === "running") running += 1;
  }
  return { awaiting, running };
}

// FR-15: `Vous attend` and `Au travail` by the time the session entered the state, oldest first; `Terminées`
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
