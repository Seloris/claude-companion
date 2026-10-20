import { formatDuration } from "../../../shared/lib/format.ts";
import { t } from "../../../shared/lib/i18n/index.ts";
import { bucketOf, type BoardSession } from "./board.ts";
import { waitingForLabel } from "./labels.ts";

export type LiveNotificationKind = "awaitingAnswer" | "recentlyFinished";

export interface LiveNotification {
  kind: LiveNotificationKind;
  session: BoardSession;
}

// What the last trusted read said about a session, enough to tell a new question or a new finished turn.
export type NotificationBaseline = Map<
  string,
  { status: BoardSession["status"]; question: string | null; turnStartedAt: string | null }
>;

// A toast has little room: the api's 300-character reply is cut here.
const MAX_BODY_PART = 140;

function cut(text: string): string {
  return text.length > MAX_BODY_PART ? `${text.slice(0, MAX_BODY_PART).trimEnd()}…` : text;
}

// FR-24, FR-25, BR-12–BR-15: compares a read of the live state with the previous trusted one.
// - `baseline` is null for the first readable read of a page and for the first one after an unreadable or failed read:
//   it becomes the new baseline and notifies nothing (BR-13). A session first seen after that notifies if it is already
//   waiting or just finished.
// - `sessions` is every live session, never a filtered list (BR-15); only the status counts (BR-14: a permission wait
//   is `running`).
// - `readAt` is the time of the read, so that the 15 minutes of `Terminées récemment` (BR-09) are those of that read.
export function trackNotifications(
  baseline: NotificationBaseline | null,
  sessions: BoardSession[],
  readAt: Date,
): { baseline: NotificationBaseline; notifications: LiveNotification[] } {
  const next: NotificationBaseline = new Map();
  const notifications: LiveNotification[] = [];
  for (const session of sessions) {
    const before = baseline?.get(session.sessionId);
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
    } else if (bucketOf(session, { now: readAt, isSeen: () => false }) === "recentlyFinished") {
      // A turn that has just ended cannot carry a `Vu` mark yet. An idle turn already seen never notifies again.
      if (before === undefined || before.status !== "idle" || before.turnStartedAt !== session.turnStartedAt) {
        notifications.push({ kind: "recentlyFinished", session });
      }
    }
  }
  return { baseline: next, notifications };
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
