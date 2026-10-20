import { useSyncExternalStore } from "react";

// BR-16: which kinds of notification are on, in this browser only. Both are off until the person turns them on.
const STORAGE_KEY = "claude-companion.live.notifications";

export interface NotificationSettings {
  awaiting: boolean;
  finished: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = { awaiting: false, finished: false };

// Storage can be missing, full or blocked: every access is guarded, and without it the settings last until the page is left.
function readSettings(): NotificationSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const { awaiting, finished } = parsed as Record<string, unknown>;
    return { awaiting: awaiting === true, finished: finished === true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do: the settings stay in memory.
  }
}

// The live page (the switches) and the layout (the gate) read the same settings in the same tab: they share one store,
// whose snapshot keeps its reference until a setting changes.
let snapshot: NotificationSettings = readSettings();
const listeners = new Set<() => void>();

function replaceSnapshot(next: NotificationSettings): void {
  if (next.awaiting === snapshot.awaiting && next.finished === snapshot.finished) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

// Another tab of the same browser writes the same storage.
function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) replaceSnapshot(readSettings());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

export function getNotificationSettings(): NotificationSettings {
  return snapshot;
}

export function setNotificationSettings(patch: Partial<NotificationSettings>): void {
  const next = { ...snapshot, ...patch };
  writeSettings(next);
  replaceSnapshot(next);
}

export function useNotificationSettings(): NotificationSettings {
  return useSyncExternalStore(subscribe, getNotificationSettings);
}
