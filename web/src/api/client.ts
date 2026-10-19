import createClient from "openapi-fetch";
import type { paths } from "./schema.d.ts";

// The only place that calls fetch; `/api` is proxied to the API by Vite in development.
export const api = createClient<paths>({ baseUrl: "/api" });

// RFC 9457 body the API sends on every error (`application/problem+json`).
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
}
