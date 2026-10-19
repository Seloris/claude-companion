import { useEffect, useState } from "react";

// The current time, re-read every `intervalMs`, so that "since when" and durations keep ticking on a page.
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
