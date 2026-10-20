export const refreshKeys = {
  all: ["refresh"] as const,
  status: () => [...refreshKeys.all, "status"] as const,
  schedule: () => [...refreshKeys.all, "schedule"] as const,
};
