import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    // Off the usual 3000/5173: other local projects run there.
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": {
        // `npm run dev:demo` (mode demo) talks to the demo API that api's `npm run demo` serves on 3101; `npm run dev` to the real one.
        target: mode === "demo" ? "http://127.0.0.1:3101" : "http://127.0.0.1:3100",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
}));
