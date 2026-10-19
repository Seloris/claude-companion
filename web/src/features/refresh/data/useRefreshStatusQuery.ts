import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, unwrap } from "../../../api/client.ts";
import { workspacesKeys } from "../../workspaces/data/workspacesKeys.ts";
import { refreshKeys } from "./refreshKeys.ts";

const POLL_INTERVAL_MS = 1000;

export function useRefreshStatusQuery() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: refreshKeys.status(),
    queryFn: async () => unwrap(await api.GET("/v1/refresh")),
    refetchInterval: (current) => (current.state.data?.isRunning ? POLL_INTERVAL_MS : false),
  });

  // The recap changes only when a refresh ends: reload it on the running → idle edge.
  const isRunning = query.data?.isRunning ?? false;
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({ queryKey: workspacesKeys.all });
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient]);

  return query;
}
