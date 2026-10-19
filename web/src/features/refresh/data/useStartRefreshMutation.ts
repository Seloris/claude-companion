import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import type { components } from "../../../api/schema.d.ts";
import { refreshKeys } from "./refreshKeys.ts";

export type RefreshMode = components["schemas"]["RefreshMode"];

export function useStartRefreshMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ mode }: { mode: RefreshMode }) =>
      unwrap(await api.POST("/v1/refresh", { params: { query: { mode } } })),
    // The returned status says the run is in progress: the status query starts polling from it.
    onSuccess: (status) => queryClient.setQueryData(refreshKeys.status(), status),
  });
}
