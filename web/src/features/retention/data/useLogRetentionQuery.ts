import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { retentionKeys } from "./retentionKeys.ts";

// Files age into the warning window, and the log folder changes, between two refreshes: re-read it from time to time.
const RETENTION_POLL_INTERVAL_MS = 5 * 60_000;

export function useLogRetentionQuery() {
  return useQuery({
    queryKey: retentionKeys.status(),
    queryFn: async () => unwrap(await api.GET("/v1/retention")),
    refetchInterval: RETENTION_POLL_INTERVAL_MS,
  });
}
