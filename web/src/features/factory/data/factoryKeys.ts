export const factoryKeys = {
  all: ["factory"] as const,
  state: () => [...factoryKeys.all, "state"] as const,
  plugins: () => [...factoryKeys.all, "plugins"] as const,
  sessionPlan: (sessionId: string) => [...factoryKeys.all, "session-plan", sessionId] as const,
};
