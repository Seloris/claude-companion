import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { factoryKeys } from "./factoryKeys.ts";

// FR-20: a change of a board file shows within 2 seconds; the API re-reads only the files that changed, so a 1 s poll is cheap.
export const FACTORY_POLL_INTERVAL_MS = 1000;

// Only a mounted page that shows boards polls (the factory page, a workspace page, the workspaces page): the layout does not.
// Pages mounted together share one query and one interval per observer, as TanStack runs it. No poll while the tab is hidden.
export function useFactoryStateQuery() {
  return useQuery({
    queryKey: factoryKeys.state(),
    queryFn: async () => unwrap(await api.GET("/v1/factory")),
    refetchInterval: FACTORY_POLL_INTERVAL_MS,
  });
}
