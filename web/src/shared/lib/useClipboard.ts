import { useCallback, useEffect, useRef, useState } from "react";

export type ClipboardState = "idle" | "copied" | "failed";

// FR-18: `copied` falls back to `idle` after this delay.
const COPIED_MS = 4000;

// Copies text to the clipboard. A missing `navigator.clipboard` (insecure context, old browser) or a refused write gives
// `failed`, which stays until the next copy so that the person can copy by hand. `copy` resolves to whether the text was
// copied, for an action that follows a copy only once it succeeded.
export function useClipboard(): { state: ClipboardState; copy: (text: string) => Promise<boolean> } {
  const [state, setState] = useState<ClipboardState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      clearTimer();
      try {
        // Reading the property inside the `try`: a browser that denies the API may throw on access.
        await navigator.clipboard.writeText(text);
      } catch {
        setState("failed");
        return false;
      }
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), COPIED_MS);
      return true;
    },
    [clearTimer],
  );

  return { state, copy };
}
