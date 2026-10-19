// The theme first, so that every component style comes after it: the skin's fonts, its tokens, the page, this application's values.
import "./shared/ui/theme/fonts.ts";
import "./shared/ui/theme/skin.css";
import "./shared/ui/theme/base.css";
import "./shared/ui/theme/overrides.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./router.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
