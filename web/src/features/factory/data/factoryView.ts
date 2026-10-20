import { useSyncExternalStore } from "react";
import type { FactoryFeatureState } from "./factoryTypes.ts";

// FR-23: the state filters and the unfolded card of each board, in this browser only.
const STORAGE_KEY = "claude-companion.factory.view";

const STATES: readonly FactoryFeatureState[] = ["empty", "spec", "plan", "running", "review", "done"];

export interface FactoryView {
  stateFilters: FactoryFeatureState[];
  // The unfolded card's slug by board root: at most one per board, and a worktree can share a slug with its checkout.
  expanded: Record<string, string>;
}

const DEFAULT_VIEW: FactoryView = { stateFilters: [], expanded: {} };

function isState(value: unknown): value is FactoryFeatureState {
  return STATES.some((state) => state === value);
}

// Storage can be missing, full or blocked: every access is guarded. Unknown states and non-string values are dropped.
function readView(): FactoryView {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_VIEW;
    const { stateFilters, expanded } = parsed as Record<string, unknown>;
    return {
      stateFilters: Array.isArray(stateFilters) ? stateFilters.filter(isState) : [],
      expanded:
        typeof expanded === "object" && expanded !== null && !Array.isArray(expanded)
          ? Object.fromEntries(Object.entries(expanded).filter(([, slug]) => typeof slug === "string"))
          : {},
    } as FactoryView;
  } catch {
    return DEFAULT_VIEW;
  }
}

function writeView(view: FactoryView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Nothing to do: the view stays in memory.
  }
}

// Every page of the tab reads one snapshot, whose reference changes only with its content.
let snapshot: FactoryView = readView();
const listeners = new Set<() => void>();

function replaceSnapshot(next: FactoryView): void {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

// Another tab of the same browser writes the same storage.
function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) replaceSnapshot(readView());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

function update(next: FactoryView): void {
  writeView(next);
  replaceSnapshot(next);
}

export function useFactoryView(): FactoryView {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function toggleStateFilter(state: FactoryFeatureState): void {
  const isOn = snapshot.stateFilters.includes(state);
  update({
    ...snapshot,
    stateFilters: isOn ? snapshot.stateFilters.filter((s) => s !== state) : [...snapshot.stateFilters, state],
  });
}

export function clearStateFilters(): void {
  update({ ...snapshot, stateFilters: [] });
}

export function setExpanded(root: string, slug: string | null): void {
  const expanded = { ...snapshot.expanded };
  if (slug === null) delete expanded[root];
  else expanded[root] = slug;
  update({ ...snapshot, expanded });
}
