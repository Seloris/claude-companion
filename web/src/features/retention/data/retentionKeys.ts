export const retentionKeys = {
  all: ["retention"] as const,
  status: () => [...retentionKeys.all, "status"] as const,
};
