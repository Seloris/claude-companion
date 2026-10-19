export const liveKeys = {
  all: ["live"] as const,
  state: () => [...liveKeys.all, "state"] as const,
};
