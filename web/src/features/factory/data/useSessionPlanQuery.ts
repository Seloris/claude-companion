import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { factoryKeys } from "./factoryKeys.ts";

// FR-35: the current plan at each open of the recap, so no staleTime and no poll: every mount refetches. `enabled: false`
// fetches nothing: the live page reads the plan only while its recap dialog is open.
export function useSessionPlanQuery(sessionId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: factoryKeys.sessionPlan(sessionId),
    queryFn: async () =>
      unwrap(await api.GET("/v1/factory/sessions/{sessionId}/plan", { params: { path: { sessionId } } })),
    enabled: options?.enabled ?? true,
  });
}
