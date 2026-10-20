import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { refreshKeys } from "./refreshKeys.ts";

export function useRefreshScheduleQuery() {
  return useQuery({
    queryKey: refreshKeys.schedule(),
    queryFn: async () => unwrap(await api.GET("/v1/refresh/schedule")),
  });
}
