import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { workspacesKeys } from "./workspacesKeys.ts";

// `enabled: false` fetches nothing: the live page reads a session only while its recap dialog is open (FR-42).
export function useSessionQuery(sessionId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workspacesKeys.session(sessionId),
    queryFn: async () => unwrap(await api.GET("/v1/sessions/{sessionId}", { params: { path: { sessionId } } })),
    enabled: options?.enabled ?? true,
  });
}
