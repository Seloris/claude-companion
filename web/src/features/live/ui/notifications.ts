import { formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { turnEndedAt, type BoardSession } from "./board.ts";
import { waitingForLabel } from "./labels.ts";

export type LiveNotificationKind = "awaitingAnswer" | "finished";

export interface LiveNotification {
  kind: LiveNotificationKind;
  session: BoardSession;
}

// What the last trusted read said about a session, enough to tell a new question or a new finished turn.
export interface NotificationBaseline {
  // The live state's own read time (the clock of `statusSince`), so a turn that ended after it is a new one (BR-19).
  readAt: string;
  sessions: Map<string, { status: BoardSession["status"]; question: string | null; turnStartedAt: string | null }>;
}

// A toast has little room: the api's 300-character reply is cut here.
const MAX_BODY_PART = 140;

function cut(text: string): string {
  return text.length > MAX_BODY_PART ? `${text.slice(0, MAX_BODY_PART).trimEnd()}…` : text;
}

// FR-24, FR-25, BR-12–BR-15: compares a read of the live state with the previous trusted one.
// - `baseline` is null for the first readable read of a page and for the first one after an unreadable or failed read:
//   it becomes the new baseline and notifies nothing (BR-13). A session first seen after that notifies if it is already
//   waiting or finished its turn after the previous read.
// - `sessions` is every live session, never a filtered list (BR-15); only the status counts (BR-14: a permission wait
//   is `running`).
// - `readAt` is the live state's own read time, compared with the end of a turn (BR-19): only a turn that ended after the
//   previous read notifies, so a session first seen, or seen again after a read that missed it, tells nothing of an old turn.
export function trackNotifications(
  baseline: NotificationBaseline | null,
  sessions: BoardSession[],
  readAt: string,
): { baseline: NotificationBaseline; notifications: LiveNotification[] } {
  const next: NotificationBaseline["sessions"] = new Map();
  const notifications: LiveNotification[] = [];
  for (const session of sessions) {
    const before = baseline?.sessions.get(session.sessionId);
    // A read that finds no log (a file busy on Windows) nulls the question and the turn: that says nothing about them,
    // so the baseline keeps what the last read that had the log said, and the turn is not told again once the log is back.
    const isLogMissing = !session.isLogFound && before !== undefined;
    next.set(session.sessionId, {
      status: session.status,
      question: isLogMissing ? before.question : session.question,
      turnStartedAt: isLogMissing ? before.turnStartedAt : session.turnStartedAt,
    });
    if (baseline === null) continue;
    if (session.status === "awaitingAnswer") {
      // Two questions answered within one poll are told apart by their text; a missing text on either side (a log not
      // read yet) is not a new question.
      const isAnotherQuestion =
        before !== undefined &&
        before.question !== null &&
        session.question !== null &&
        before.question !== session.question;
      if (before === undefined || before.status !== "awaitingAnswer" || isAnotherQuestion) {
        notifications.push({ kind: "awaitingAnswer", session });
      }
    } else {
      // Marks are not read: a turn that ended after the last read cannot be closed yet. A session the baseline knows
      // notifies on the transition itself (the read time is stamped after the files are read, so a turn that ended
      // during the previous read must still count); a `statusSince` moved without a new turn is told apart by the
      // turn's start. A session the baseline does not know notifies only for a turn that ended after the previous read (BR-19).
      const ended = turnEndedAt(session);
      const isNewTurn =
        before === undefined
          ? ended !== null && new Date(ended).getTime() > new Date(baseline.readAt).getTime()
          : before.status !== "idle" || before.turnStartedAt !== session.turnStartedAt;
      if (ended !== null && isNewTurn) {
        notifications.push({ kind: "finished", session });
      }
    }
  }
  return { baseline: { readAt, sessions: next }, notifications };
}

// One notification per session at a time (BR-12): the browser replaces a notification that has the same tag.
export function notificationTag(sessionId: string): string {
  return `claude-companion.live.${sessionId}`;
}

export function notificationText({ kind, session }: LiveNotification): { title: string; body: string } {
  const workspace = session.workspace.name;
  if (kind === "awaitingAnswer") {
    return {
      title: t("live.notify.awaitingTitle", { workspace }),
      body: t("live.notify.awaitingBody", {
        title: session.title,
        question: cut(session.question ?? waitingForLabel(session.waitingFor)),
      }),
    };
  }
  const turnMs =
    session.turnStartedAt === null
      ? 0
      : Math.max(0, new Date(session.statusSince).getTime() - new Date(session.turnStartedAt).getTime());
  return {
    title: t("live.notify.finishedTitle", { workspace }),
    body: t("live.notify.finishedBody", {
      title: session.title,
      turn: t("live.tile.turn", { duration: formatDuration(turnMs) }),
      reply: session.lastReply === null ? t("live.reply.none") : cut(session.lastReply),
    }),
  };
}
