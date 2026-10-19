import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { workspacesKeys } from "./workspacesKeys.ts";

export function useWorkspacesQuery({ includeScratch }: { includeScratch: boolean }) {
  return useQuery({
    queryKey: workspacesKeys.list(includeScratch),
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/workspaces", {
          params: { query: { includeScratch: includeScratch ? "true" : "false" } },
        }),
      ),
  });
}
