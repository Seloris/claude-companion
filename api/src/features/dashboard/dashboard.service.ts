import type { Clock } from "../../shared/clock.js";
import type { TokenCounts } from "../workspaces/workspaces.schema.js";
import type {
  DashboardFilter,
  DashboardRepository,
  TokenSums,
  WorkspaceCountRow,
  WorkspaceTokenRow,
} from "./dashboard.repository.js";
import type { Dashboard, DashboardPeriod } from "./dashboard.schema.js";

const DAY_MS = 24 * 3600 * 1000;
const PERIOD_DAYS: Record<Exclude<DashboardPeriod, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const ZERO_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function createDashboardService({ dashboardRepo, clock }: { dashboardRepo: DashboardRepository; clock: Clock }) {
  return {
    async getDashboard(query: {
      period: DashboardPeriod;
      workspaceId?: number | undefined;
      includeScratch: boolean;
      timeZone: string;
    }): Promise<Dashboard> {
      const until = clock.now();
      const since = query.period === "all" ? null : new Date(until.getTime() - PERIOD_DAYS[query.period] * DAY_MS);
      const filter: DashboardFilter = { since, workspaceId: query.workspaceId ?? null, includeScratch: query.includeScratch };
      // FR-11: the per-workspace breakdown only means something over all workspaces.
      const hasBreakdown = filter.workspaceId === null;

      const [totals, agentRuns, agentTokens, skills, tools, mcpServers, models, starts] = await Promise.all([
        dashboardRepo.totals(filter),
        dashboardRepo.agentTypeRuns(filter),
        dashboardRepo.agentTypeTokens(filter),
        dashboardRepo.skills(filter),
        dashboardRepo.tools(filter),
        dashboardRepo.mcpServers(filter),
        dashboardRepo.models(filter),
        dashboardRepo.sessionStarts(filter),
      ]);

      return {
        period: { since: since?.toISOString() ?? null, until: until.toISOString() },
        workspaceId: filter.workspaceId,
        totals: { ...totals, tokens: toTokens(totals.tokens) },
        agentTypes: rankAgentTypes(agentRuns, agentTokens, hasBreakdown),
        skills: rankCounts(skills, hasBreakdown),
        tools: rankCounts(tools, hasBreakdown),
        mcpServers: rankCounts(mcpServers, hasBreakdown),
        models: rankModels(models, hasBreakdown),
        days: toDays(starts, since, until, query.timeZone),
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;

function toTokens(sums: TokenSums): TokenCounts {
  return {
    input: sums.inputTokens,
    output: sums.outputTokens,
    cacheRead: sums.cacheReadTokens,
    cacheWrite: sums.cacheWriteTokens,
  };
}

function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

// The figure the pages show as "the tokens": input + output, cache excluded.
function shownTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.output;
}

interface Group<V> {
  name: string;
  value: V;
  byWorkspace: { workspaceId: number; workspaceName: string; value: V }[];
}

// Folds the (name, workspace) rows into one ranked item per name, the largest first, ties by name.
function rank<R extends { name: string; workspaceId: number; workspaceName: string }, V>(
  rows: R[],
  valueOf: (row: R) => V,
  add: (a: V, b: V) => V,
  weight: (value: V) => number,
): Group<V>[] {
  const groups = new Map<string, Group<V>>();
  for (const row of rows) {
    const value = valueOf(row);
    const group = groups.get(row.name);
    const part = { workspaceId: row.workspaceId, workspaceName: row.workspaceName, value };
    if (group === undefined) groups.set(row.name, { name: row.name, value, byWorkspace: [part] });
    else {
      group.value = add(group.value, value);
      group.byWorkspace.push(part);
    }
  }
  const order = (a: V, b: V, aName: string, bName: string) => weight(b) - weight(a) || aName.localeCompare(bName);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      byWorkspace: group.byWorkspace.sort((a, b) => order(a.value, b.value, a.workspaceName, b.workspaceName)),
    }))
    .sort((a, b) => order(a.value, b.value, a.name, b.name));
}

function rankCounts(rows: WorkspaceCountRow[], hasBreakdown: boolean): Dashboard["skills"] {
  return rank(
    rows,
    (row) => row.count,
    (a, b) => a + b,
    (value) => value,
  ).map((group) => ({
    name: group.name,
    count: group.value,
    byWorkspace: hasBreakdown
      ? group.byWorkspace.map((part) => ({
          workspaceId: part.workspaceId,
          workspaceName: part.workspaceName,
          count: part.value,
        }))
      : [],
  }));
}

function rankModels(rows: WorkspaceTokenRow[], hasBreakdown: boolean): Dashboard["models"] {
  return rank(rows, toTokens, addTokens, shownTokens).map((group) => ({
    name: group.name,
    tokens: group.value,
    byWorkspace: hasBreakdown
      ? group.byWorkspace.map((part) => ({
          workspaceId: part.workspaceId,
          workspaceName: part.workspaceName,
          tokens: part.value,
        }))
      : [],
  }));
}

function rankAgentTypes(
  runs: WorkspaceCountRow[],
  tokens: WorkspaceTokenRow[],
  hasBreakdown: boolean,
): Dashboard["agentTypes"] {
  const tokensByKey = new Map(tokens.map((row) => [`${row.name}\u0000${row.workspaceId}`, toTokens(row)]));
  const rows = runs.map((row) => ({
    ...row,
    tokens: tokensByKey.get(`${row.name}\u0000${row.workspaceId}`) ?? ZERO_TOKENS,
  }));
  return rank(
    rows,
    (row) => ({ runCount: row.count, tokens: row.tokens }),
    (a, b) => ({ runCount: a.runCount + b.runCount, tokens: addTokens(a.tokens, b.tokens) }),
    (value) => value.runCount,
  ).map((group) => ({
    name: group.name,
    runCount: group.value.runCount,
    tokens: group.value.tokens,
    byWorkspace: hasBreakdown
      ? group.byWorkspace.map((part) => ({
          workspaceId: part.workspaceId,
          workspaceName: part.workspaceName,
          runCount: part.value.runCount,
          tokens: part.value.tokens,
        }))
      : [],
  }));
}

// FR-12: every day of the period, in the person's time zone, those without session at zero.
function toDays(
  starts: ({ startedAt: Date } & TokenSums)[],
  since: Date | null,
  until: Date,
  timeZone: string,
): Dashboard["days"] {
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayOf = (date: Date) => dayFormat.format(date);
  const byDay = new Map<string, { sessionCount: number; tokens: TokenCounts }>();
  let first: Date | null = since;
  for (const start of starts) {
    if (first === null || start.startedAt < first) first = start.startedAt;
    const day = dayOf(start.startedAt);
    const bucket = byDay.get(day) ?? { sessionCount: 0, tokens: ZERO_TOKENS };
    byDay.set(day, { sessionCount: bucket.sessionCount + 1, tokens: addTokens(bucket.tokens, toTokens(start)) });
  }
  if (first === null) return [];

  const days: Dashboard["days"] = [];
  const last = dayOf(until);
  // Calendar arithmetic on the day keys themselves: a UTC midnight never crosses a daylight-saving change.
  for (let day = dayOf(first); day <= last; day = nextDay(day)) {
    const bucket = byDay.get(day);
    days.push({ date: day, sessionCount: bucket?.sessionCount ?? 0, tokens: bucket?.tokens ?? ZERO_TOKENS });
  }
  return days;
}

function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
}
