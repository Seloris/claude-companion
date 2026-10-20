import { useSyncExternalStore } from "react";

// FR-39, BR-22: the `Mode compact` switch of the live page, off by default and kept by this browser only, like the
// notification settings (BR-16).
const STORAGE_KEY = "claude-companion.live.compact";

// Storage can be missing, full or blocked: every access is guarded, and without it the mode lasts until the page is left.
function readCompact(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "false") === true;
  } catch {
    return false;
  }
}

function writeCompact(isCompact: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(isCompact));
  } catch {
    // Nothing to do: the mode stays in memory.
  }
}

let snapshot = readCompact();
const listeners = new Set<() => void>();

function replaceSnapshot(next: boolean): void {
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

// Another tab of the same browser writes the same storage.
function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) replaceSnapshot(readCompact());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

function getCompactMode(): boolean {
  return snapshot;
}

export function setCompactMode(isCompact: boolean): void {
  writeCompact(isCompact);
  replaceSnapshot(isCompact);
}

export function useCompactMode(): boolean {
  return useSyncExternalStore(subscribe, getCompactMode);
}
