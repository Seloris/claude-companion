import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  { path: "/", lazy: () => import("./features/workspaces/pages/WorkspacesPage.tsx") },
  { path: "/workspaces/:workspaceId", lazy: () => import("./features/workspaces/pages/WorkspacePage.tsx") },
  { path: "/sessions/:sessionId", lazy: () => import("./features/workspaces/pages/SessionPage.tsx") },
  { path: "/dashboard", lazy: () => import("./features/dashboard/pages/DashboardPage.tsx") },
]);
