import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { workspacesKeys } from "./workspacesKeys.ts";

export function useWorkspaceQuery(workspaceId: number) {
  return useQuery({
    queryKey: workspacesKeys.detail(workspaceId),
    queryFn: async () =>
      unwrap(await api.GET("/v1/workspaces/{workspaceId}", { params: { path: { workspaceId } } })),
  });
}
