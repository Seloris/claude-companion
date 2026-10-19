import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Off the usual 3000/5173: other local projects run there.
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
