import { createBrowserRouter } from "react-router";

// One lazy route per feature page: `{ path: "/orders", lazy: () => import("./features/orders/pages/OrdersPage.tsx") }`.
export const router = createBrowserRouter([
  { path: "/", element: <h1>claude-companion</h1> },
]);
