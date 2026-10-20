import { useSyncExternalStore } from "react";

// Factory-board FR-23, live-sessions FR-38: the `avec revue` and `test navigateur` switches of the prompts to copy, off by
// default and kept by this browser only. The factory page and a workspace's factory section set them; the live page's
// `Prochaine : …` button reads them.
const STORAGE_KEY = "claude-companion.factory.promptSwitches";

export interface PromptSwitches {
  isReview: boolean;
  isBrowser: boolean;
}

const DEFAULT_SWITCHES: PromptSwitches = { isReview: false, isBrowser: false };

// Storage can be missing, full or blocked: every access is guarded, and without it the switches last until the page is left.
function readSwitches(): PromptSwitches {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SWITCHES;
    const { isReview, isBrowser } = parsed as Record<string, unknown>;
    return { isReview: isReview === true, isBrowser: isBrowser === true };
  } catch {
    return DEFAULT_SWITCHES;
  }
}

function writeSwitches(switches: PromptSwitches): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(switches));
  } catch {
    // Nothing to do: the switches stay in memory.
  }
}

// One store for every page of the tab, whose snapshot keeps its reference until a switch changes.
let snapshot: PromptSwitches = readSwitches();
const listeners = new Set<() => void>();

function replaceSnapshot(next: PromptSwitches): void {
  if (next.isReview === snapshot.isReview && next.isBrowser === snapshot.isBrowser) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

// Another tab of the same browser writes the same storage.
function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) replaceSnapshot(readSwitches());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

export function getPromptSwitches(): PromptSwitches {
  return snapshot;
}

export function setPromptSwitches(patch: Partial<PromptSwitches>): void {
  const next = { ...snapshot, ...patch };
  writeSwitches(next);
  replaceSnapshot(next);
}

export function usePromptSwitches(): PromptSwitches {
  return useSyncExternalStore(subscribe, getPromptSwitches);
}
