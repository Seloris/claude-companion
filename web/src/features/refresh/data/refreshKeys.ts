export const refreshKeys = {
  all: ["refresh"] as const,
  status: () => [...refreshKeys.all, "status"] as const,
};
