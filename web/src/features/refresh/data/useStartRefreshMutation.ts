import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import { refreshKeys } from "./refreshKeys.ts";

export function useStartRefreshMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/refresh")),
    // The returned status says the run is in progress: the status query starts polling from it.
    onSuccess: (status) => queryClient.setQueryData(refreshKeys.status(), status),
  });
}
