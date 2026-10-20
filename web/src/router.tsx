import { createBrowserRouter } from "react-router";
import { AppLayout } from "./AppLayout.tsx";

export const router = createBrowserRouter([
  {
    Component: AppLayout,
    children: [
      { path: "/", lazy: () => import("./features/workspaces/pages/WorkspacesPage.tsx") },
      { path: "/workspaces/:workspaceId", lazy: () => import("./features/workspaces/pages/WorkspacePage.tsx") },
      { path: "/sessions/:sessionId", lazy: () => import("./features/workspaces/pages/SessionPage.tsx") },
      { path: "/dashboard", lazy: () => import("./features/dashboard/pages/DashboardPage.tsx") },
      { path: "/live", lazy: () => import("./features/live/pages/LivePage.tsx") },
      { path: "/factory", lazy: () => import("./features/factory/pages/FactoryPage.tsx") },
    ],
  },
]);
