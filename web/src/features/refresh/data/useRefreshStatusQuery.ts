import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, unwrap } from "../../../api/client.ts";
import { dashboardKeys } from "../../dashboard/data/dashboardKeys.ts";
import { retentionKeys } from "../../retention/data/retentionKeys.ts";
import { workspacesKeys } from "../../workspaces/data/workspacesKeys.ts";
import { refreshKeys } from "./refreshKeys.ts";

const RUNNING_POLL_INTERVAL_MS = 1000;
// While idle the status is still read, so that a refresh the API starts by itself (the periodic one,
// session-ingestion FR-13) shows on every page.
const IDLE_POLL_INTERVAL_MS = 30_000;

export function useRefreshStatusQuery() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: refreshKeys.status(),
    queryFn: async () => unwrap(await api.GET("/v1/refresh")),
    refetchInterval: (current) => (current.state.data?.isRunning ? RUNNING_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS),
  });

  // The recap and the log retention change only when a refresh ends: reload them on the running → idle edge.
  const isRunning = query.data?.isRunning ?? false;
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({ queryKey: workspacesKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: retentionKeys.all });
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient]);

  // A fast run can start and end between two reads of the status (one started by the API when a live session ends,
  // or by its periodic refresh): no running → idle edge is seen then, but a new report says the recap changed.
  // The first report seen is not a change.
  const finishedAt = query.data === undefined ? undefined : (query.data.lastReport?.finishedAt ?? null);
  const lastFinishedAt = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (finishedAt === undefined) return;
    if (lastFinishedAt.current !== undefined && lastFinishedAt.current !== finishedAt) {
      void queryClient.invalidateQueries({ queryKey: workspacesKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: retentionKeys.all });
    }
    lastFinishedAt.current = finishedAt;
  }, [finishedAt, queryClient]);

  return query;
}
