import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { factoryKeys } from "./factoryKeys.ts";

// FR-41: read once per page load (and on the query defaults' refetches); the versions change rarely, nothing polls them.
export function usePluginVersionsQuery() {
  return useQuery({
    queryKey: factoryKeys.plugins(),
    queryFn: async () => unwrap(await api.GET("/v1/factory/plugins")),
  });
}
