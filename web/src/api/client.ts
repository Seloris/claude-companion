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

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | undefined;

  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

// The data of a successful call, or an ApiError carrying the problem details: TanStack Query needs a throw.
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  throw new ApiError(result.response.status, result.error as ProblemDetails | undefined);
}
