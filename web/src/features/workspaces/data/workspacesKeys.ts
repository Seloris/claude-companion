// Sessions sit under the workspaces key: a finished refresh invalidates them all at once.
export const workspacesKeys = {
  all: ["workspaces"] as const,
  list: (includeScratch: boolean) => [...workspacesKeys.all, "list", { includeScratch }] as const,
  detail: (workspaceId: number) => [...workspacesKeys.all, "detail", workspaceId] as const,
  session: (sessionId: string) => [...workspacesKeys.all, "session", sessionId] as const,
};
