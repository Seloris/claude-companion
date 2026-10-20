export const factoryKeys = {
  all: ["factory"] as const,
  state: () => [...factoryKeys.all, "state"] as const,
  plugins: () => [...factoryKeys.all, "plugins"] as const,
};
