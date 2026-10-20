import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import type { components } from "../../../api/schema.d.ts";
import { refreshKeys } from "./refreshKeys.ts";

export type RefreshInterval = components["schemas"]["RefreshInterval"];

export function useSetRefreshScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ intervalMinutes }: { intervalMinutes: RefreshInterval }) =>
      unwrap(await api.PUT("/v1/refresh/schedule", { body: { intervalMinutes } })),
    // The returned schedule is the one now in force: no second read needed.
    onSuccess: (schedule) => queryClient.setQueryData(refreshKeys.schedule(), schedule),
  });
}
