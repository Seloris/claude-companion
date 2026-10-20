import { useSyncExternalStore } from "react";
import { setNotificationSettings } from "./notificationSettings.ts";

// FR-29: the browser's permission, or that the browser cannot show notifications for this page at all (no
// Notification API, or an address that is not a secure context, such as a LAN one).
export type NotificationPermissionState = "unsupported" | NotificationPermission;

export function readPermission(): NotificationPermissionState {
  if (!("Notification" in window) || !window.isSecureContext) return "unsupported";
  return Notification.permission;
}

const listeners = new Set<() => void>();
let removeSources: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

// The permission can change outside the page (the site settings): it is re-read when the browser says so, and when the
// person comes back to the tab.
function addSources(): () => void {
  let isActive = true;
  let status: PermissionStatus | null = null;
  window.addEventListener("focus", emit);
  document.addEventListener("visibilitychange", emit);
  // Some browsers reject the `notifications` name: the focus and visibility events are enough then.
  try {
    navigator.permissions
      .query({ name: "notifications" })
      .then((result) => {
        if (!isActive) return;
        status = result;
        status.addEventListener("change", emit);
      })
      .catch(() => {});
  } catch {
    // No Permissions API.
  }
  return () => {
    isActive = false;
    window.removeEventListener("focus", emit);
    document.removeEventListener("visibilitychange", emit);
    status?.removeEventListener("change", emit);
  };
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) removeSources = addSources();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      removeSources?.();
      removeSources = null;
    }
  };
}

export function useNotificationPermission(): NotificationPermissionState {
  return useSyncExternalStore(subscribe, readPermission);
}

// FR-23: only from a click, since browsers ignore a request made outside a user gesture. A granted permission turns
// `Question posée` on at once; `Tour terminé` stays off until the person switches it on.
export async function requestNotificationPermission(): Promise<void> {
  try {
    if (readPermission() === "unsupported") return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") setNotificationSettings({ awaiting: true });
  } catch {
    // The state is re-read below.
  }
  emit();
}
