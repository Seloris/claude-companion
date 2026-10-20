import express, { Router } from "express";
import path from "node:path";

// An API path (the root mount and its /api alias) is never answered with index.html: an unknown one must 404.
const API_PREFIXES = ["/api", "/v1", "/health"];

function isApiPath(requestPath: string): boolean {
  const lower = requestPath.toLowerCase();
  return API_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix + "/"));
}

// Serves the built front. Written as a middleware, not as a "*" route: Express 5 rejects that path, and an asset
// missing from the build (a path with a dot in its last segment) must answer 404, never index.html.
export function webRoutes({ webDir }: { webDir: string }): Router {
  const router = Router();
  router.use(express.static(webDir));
  router.use((req, res, next) => {
    const isFrontRoute =
      (req.method === "GET" || req.method === "HEAD") &&
      !isApiPath(req.path) &&
      !path.posix.basename(req.path).includes(".");
    if (!isFrontRoute) {
      next();
      return;
    }
    res.sendFile(path.join(webDir, "index.html"));
  });
  return router;
}
