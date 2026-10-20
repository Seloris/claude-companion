import type { UseQueryResult } from "@tanstack/react-query";
import type { FactorySessionPlan, FactorySessionPlanResponse } from "./factoryTypes.ts";

// What the recap shows of a session's plan: nothing while it loads or when the session has none (FR-37), an error, or
// the plan read (FR-32).
export type SessionPlanState =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; plan: FactorySessionPlan };

export function toSessionPlanState(query: UseQueryResult<FactorySessionPlanResponse>): SessionPlanState {
  if (query.isPending) return { kind: "none" };
  if (query.isError) return { kind: "error", message: query.error.message };
  if (query.data.plan === null) return { kind: "none" };
  return { kind: "loaded", plan: query.data.plan };
}
