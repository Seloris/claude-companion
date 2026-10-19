import type { DashboardFilters } from "./useDashboardQuery.ts";

// A finished refresh invalidates every dashboard at once, whatever its filters.
export const dashboardKeys = {
  all: ["dashboard"] as const,
  detail: (filters: DashboardFilters) => [...dashboardKeys.all, filters] as const,
};
