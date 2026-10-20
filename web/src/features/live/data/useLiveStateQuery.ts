import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, unwrap } from "../../../api/client.ts";
import type { components } from "../../../api/schema.d.ts";
import { refreshKeys } from "../../refresh/data/refreshKeys.ts";
import { liveKeys } from "./liveKeys.ts";

type LiveState = components["schemas"]["LiveState"];

// FR-11: a change of status or activity shows within 5 seconds, so the poll is faster than that.
export const LIVE_POLL_INTERVAL_MS = 3000;

function sessionIds(state: LiveState): Set<string> {
  return new Set(state.workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.sessionId)));
}

// The page and the navigation badge share one query. Only the observer that `isPolling` (the layout) runs the poll and
// the leave detection: TanStack runs one interval per observer, so a second poller would double the requests.
export function useLiveStateQuery({ isPolling }: { isPolling: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: liveKeys.state(),
    queryFn: async () => unwrap(await api.GET("/v1/live")),
    refetchInterval: isPolling ? LIVE_POLL_INTERVAL_MS : false,
    // FR-27: the notifications need the poll while the tab is hidden, which is exactly when the person is elsewhere.
    refetchIntervalInBackground: isPolling,
  });

  // FR-13: a session that left the live state makes the API start a refresh; look at its status now, so that
  // its end reloads the recap. An unreadable folder holds no session and says nothing about the previous ones.
  const state = query.data;
  const previousIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isPolling || state === undefined || !state.isSessionsDirReadable) return;
    const ids = sessionIds(state);
    const hasLeft = previousIds.current !== null && [...previousIds.current].some((id) => !ids.has(id));
    previousIds.current = ids;
    if (hasLeft) void queryClient.invalidateQueries({ queryKey: refreshKeys.status() });
  }, [state, isPolling, queryClient]);

  return query;
}
