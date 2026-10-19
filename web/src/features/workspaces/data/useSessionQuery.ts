import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { workspacesKeys } from "./workspacesKeys.ts";

export function useSessionQuery(sessionId: string) {
  return useQuery({
    queryKey: workspacesKeys.session(sessionId),
    queryFn: async () => unwrap(await api.GET("/v1/sessions/{sessionId}", { params: { path: { sessionId } } })),
  });
}
