import { t } from "../../../shared/lib/i18n/index.ts";
import type { FactoryBoard, FactoryRun, FactoryState } from "../data/factoryTypes.ts";
import { isBetterRun, isNewerRun, isUnderway, isUnderwayPhase, phaseLabel, runStateLabel, stepLabel, withPlanName } from "./labels.ts";

interface Candidate {
  board: FactoryBoard;
  run: FactoryRun;
  phase: string;
  isUnderway: boolean;
}

// Keeps, per session, the candidate `isBetter` prefers.
function bestBySession(candidates: Candidate[], isBetter: (a: FactoryRun, b: FactoryRun) => boolean): Map<string, Candidate> {
  const best = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const current = best.get(candidate.run.sessionId);
    if (current === undefined || isBetter(candidate.run, current.run)) best.set(candidate.run.sessionId, candidate);
  }
  return best;
}

function lineOf({ board, run, phase, isUnderway: underway }: Candidate): string {
  const suffix = board.isStale && underway ? ` · ${t("factory.run.atLastScan")}` : "";
  return [run.feature ?? t("factory.run.newFeature"), withPlanName(stepLabel(board, run), run.folder), `${phase}${suffix}`].join(" · ");
}

// Factory-board FR-31: the factory job of each session, by session id, over every board. A live run wins over a session
// (the fresher one); the main loop wins over a subagent's run, then the latest change. A stale board is used too.
export function factoryLines(state: FactoryState): Map<string, string> {
  const boards = state.workspaces.flatMap((workspace) => workspace.boards);
  const live = bestBySession(
    boards.flatMap((board) => board.live.map((run) => ({ board, run, phase: runStateLabel(run), isUnderway: isUnderway(run) }))),
    isBetterRun,
  );
  const sessions = bestBySession(
    boards.flatMap((board) =>
      board.sessions.map((session) => ({
        board,
        run: session,
        phase: phaseLabel(session.phase),
        isUnderway: isUnderwayPhase(session.phase),
      })),
    ),
    isNewerRun,
  );
  const lines = new Map<string, string>();
  for (const [sessionId, candidate] of sessions) lines.set(sessionId, lineOf(candidate));
  for (const [sessionId, candidate] of live) lines.set(sessionId, lineOf(candidate));
  return lines;
}
