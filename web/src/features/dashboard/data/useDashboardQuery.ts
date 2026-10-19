import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../../api/client.ts";
import type { components } from "../../../api/schema.d.ts";
import { dashboardKeys } from "./dashboardKeys.ts";

export type DashboardPeriod = components["schemas"]["DashboardPeriod"];

export interface DashboardFilters {
  period: DashboardPeriod;
  workspaceId: number | null;
  includeScratch: boolean;
}

// The days of the activity over time are the person's: the API buckets them in the browser's time zone.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useDashboardQuery(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.detail(filters),
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/dashboard", {
          params: {
            query: {
              period: filters.period,
              ...(filters.workspaceId === null ? {} : { workspaceId: filters.workspaceId }),
              includeScratch: filters.includeScratch ? "true" : "false",
              timeZone,
            },
          },
        }),
      ),
    // The blocks stay on screen while a selector change loads the next figures.
    placeholderData: keepPreviousData,
  });
}
