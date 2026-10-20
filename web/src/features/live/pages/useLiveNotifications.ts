import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { readPermission } from "../data/notificationPermission.ts";
import { getNotificationSettings, useNotificationSettings } from "../data/notificationSettings.ts";
import type { useLiveStateQuery } from "../data/useLiveStateQuery.ts";
import { flattenWorkspaces } from "../ui/board.ts";
import {
  notificationTag,
  notificationText,
  trackNotifications,
  type LiveNotification,
  type LiveNotificationKind,
  type NotificationBaseline,
} from "../ui/notifications.ts";

// BR-12: of all the tabs of the application that are open, the one that holds this lock shows the notifications.
const LEADER_LOCK = "claude-companion.live.notifier";

interface Held {
  kind: LiveNotificationKind;
  notification: Notification;
}

function closeHeld(held: Map<string, Held>, sessionId: string): void {
  const entry = held.get(sessionId);
  if (entry === undefined) return;
  held.delete(sessionId);
  entry.notification.close();
}

// FR-24, FR-25, FR-27, FR-28, FR-30: shows, replaces and withdraws the browser notifications for the changes of the
// live state. It follows the layout's own poll, so that every page of the application notifies (FR-27).
export function useLiveNotifications(liveQuery: ReturnType<typeof useLiveStateQuery>): void {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const isLeaderRef = useRef(false);
  const baselineRef = useRef<NotificationBaseline | null>(null);
  const handledRef = useRef(0);
  const heldRef = useRef(new Map<string, Held>());
  const settings = useNotificationSettings();

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // BR-12: the leader tab. The request waits until the current leader closes; the cleanup cancels a request that is
  // still waiting (a StrictMode remount never leaves two holders) and releases the lock otherwise. Without the Web
  // Locks API every tab notifies, and the tag of each notification folds the duplicates.
  useEffect(() => {
    if (!("locks" in navigator)) {
      isLeaderRef.current = true;
      return () => {
        isLeaderRef.current = false;
      };
    }
    const controller = new AbortController();
    const lock: { release: (() => void) | null } = { release: null };
    navigator.locks
      .request(LEADER_LOCK, { signal: controller.signal }, () => {
        isLeaderRef.current = true;
        return new Promise<void>((resolve) => {
          lock.release = resolve;
        });
      })
      .catch(() => {
        // Aborted before the lock was granted.
      });
    return () => {
      controller.abort();
      lock.release?.();
      isLeaderRef.current = false;
    };
  }, []);

  // The changes between one read and the next. A failed or unreadable read drops the baseline, so that the next
  // readable read is a new one that notifies nothing (BR-13). A failed refetch keeps `data` and `dataUpdatedAt` and only
  // moves `isError`, hence the check before the once-per-read guard.
  const { data, dataUpdatedAt, isError } = liveQuery;
  useEffect(() => {
    if (isError || data === undefined || !data.isSessionsDirReadable) {
      baselineRef.current = null;
      return;
    }
    if (handledRef.current === dataUpdatedAt) return;
    handledRef.current = dataUpdatedAt;

    const sessions = flattenWorkspaces(data);
    const tracked = trackNotifications(baselineRef.current, sessions, new Date(dataUpdatedAt));
    baselineRef.current = tracked.baseline;

    const held = heldRef.current;
    // FR-30: a question that was answered, or whose session left, no longer waits for anything.
    const awaitingIds = new Set(sessions.filter((session) => session.status === "awaitingAnswer").map((session) => session.sessionId));
    for (const [sessionId, entry] of held) {
      if (entry.kind === "awaitingAnswer" && !awaitingIds.has(sessionId)) closeHeld(held, sessionId);
    }

    // The permission can be revoked while the page is open: it is checked again right before every notification.
    if (!isLeaderRef.current || readPermission() !== "granted") return;
    const switches = getNotificationSettings();
    for (const notification of tracked.notifications) {
      const isOn = notification.kind === "awaitingAnswer" ? switches.awaiting : switches.finished;
      if (isOn) show(held, notification, navigateRef);
    }
  }, [data, dataUpdatedAt, isError]);

  // FR-26: a kind that is switched off takes its open notifications back.
  useEffect(() => {
    const held = heldRef.current;
    for (const [sessionId, entry] of held) {
      if (!(entry.kind === "awaitingAnswer" ? settings.awaiting : settings.finished)) closeHeld(held, sessionId);
    }
  }, [settings]);
}

// BR-12: the session's previous notification is closed first, since a replacement under the same tag is silent in
// Chrome. FR-28: a click brings the window forward and opens the live page on the session's workspace, without marking
// anything `Vu` (BR-17).
function show(held: Map<string, Held>, live: LiveNotification, navigateRef: { current: ReturnType<typeof useNavigate> }): void {
  const { sessionId, workspace } = live.session;
  closeHeld(held, sessionId);
  const text = notificationText(live);
  try {
    const notification = new Notification(text.title, { body: text.body, tag: notificationTag(sessionId), lang: "fr" });
    const entry: Held = { kind: live.kind, notification };
    held.set(sessionId, entry);
    notification.onclose = () => {
      if (held.get(sessionId) === entry) held.delete(sessionId);
    };
    notification.onclick = () => {
      window.focus();
      void navigateRef.current("/live", { state: { workspace: workspace.key } });
      notification.close();
    };
  } catch {
    // The browser refused this notification: the next change gets its own chance.
  }
}
