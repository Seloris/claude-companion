// A port over setTimeout, so the schedulers are tested without real time.
export interface Timer {
  // Runs `run` once after `delayMs`; returns the function that cancels it.
  schedule(run: () => void, delayMs: number): () => void;
}

export const systemTimer: Timer = {
  schedule(run, delayMs) {
    const handle = setTimeout(run, delayMs);
    // A pending tick never holds the process open.
    handle.unref();
    return () => clearTimeout(handle);
  },
};
