import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { components } from "../../../api/schema.d.ts";
import { formatNumber, formatTokens } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { Field } from "../../../shared/ui/Field.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Panel } from "../../../shared/ui/Panel.tsx";
import { Select } from "../../../shared/ui/Select.tsx";
import { useWorkspacesQuery } from "../../workspaces/data/useWorkspacesQuery.ts";
import { useDashboardQuery, type DashboardPeriod } from "../data/useDashboardQuery.ts";
import { ActivityChart } from "../ui/ActivityChart.tsx";
import { DashboardFilters, PERIODS } from "../ui/DashboardFilters.tsx";
import { DashboardTotals } from "../ui/DashboardTotals.tsx";
import { RankingTable, type RankingItem } from "../ui/RankingTable.tsx";
import styles from "./DashboardPage.module.css";

type Dashboard = components["schemas"]["Dashboard"];
type TokenCounts = components["schemas"]["TokenCounts"];
type AgentSort = "runs" | "tokens";

const DEFAULT_PERIOD: DashboardPeriod = "30d";

// The figure the pages show as "the tokens": input + output, cache excluded.
function shown(tokens: TokenCounts): number {
  return tokens.input + tokens.output;
}

function tokenLabel(tokens: TokenCounts): string {
  return t("tokens.count.label", { count: formatTokens(shown(tokens)) });
}

function countItems(rankings: Dashboard["skills"]): RankingItem[] {
  return rankings.map((item) => ({
    key: item.name,
    name: item.name,
    value: item.count,
    label: tp("dashboard.rankings.calls", item.count),
    byWorkspace: item.byWorkspace.map((part) => ({
      key: String(part.workspaceId),
      name: part.workspaceName,
      value: part.count,
      label: tp("dashboard.rankings.calls", part.count),
    })),
  }));
}

function agentItems(rankings: Dashboard["agentTypes"], sort: AgentSort): RankingItem[] {
  const valueOf = (entry: { runCount: number; tokens: TokenCounts }) =>
    sort === "runs" ? entry.runCount : shown(entry.tokens);
  return rankings
    .map((item) => ({
      key: item.name,
      name: item.name,
      value: valueOf(item),
      label: sort === "runs" ? tp("dashboard.rankings.runs", item.runCount) : tokenLabel(item.tokens),
      detail: sort === "runs" ? tokenLabel(item.tokens) : tp("dashboard.rankings.runs", item.runCount),
      byWorkspace: item.byWorkspace
        .map((part) => ({
          key: String(part.workspaceId),
          name: part.workspaceName,
          value: valueOf(part),
          label: sort === "runs" ? tp("dashboard.rankings.runs", part.runCount) : tokenLabel(part.tokens),
        }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function modelItems(rankings: Dashboard["models"]): RankingItem[] {
  return rankings.map((item) => ({
    key: item.name,
    name: item.name,
    value: shown(item.tokens),
    label: tokenLabel(item.tokens),
    byWorkspace: item.byWorkspace.map((part) => ({
      key: String(part.workspaceId),
      name: part.workspaceName,
      value: shown(part.tokens),
      label: tokenLabel(part.tokens),
    })),
  }));
}

function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = PERIODS.find((candidate) => candidate === searchParams.get("period")) ?? DEFAULT_PERIOD;
  const workspaceParam = Number(searchParams.get("workspace"));
  const workspaceId = Number.isInteger(workspaceParam) && workspaceParam > 0 ? workspaceParam : null;
  // FR-14: the same switch, and the same search parameter, as the workspaces page.
  const includeScratch = searchParams.get("scratch") === "1";
  const [agentSort, setAgentSort] = useState<AgentSort>("runs");

  const dashboardQuery = useDashboardQuery({ period, workspaceId, includeScratch });
  // The chosen workspace is listed even when it is the Scratch group with the switch off.
  const workspacesQuery = useWorkspacesQuery({ includeScratch: true });
  const workspaces = (workspacesQuery.data?.workspaces ?? [])
    .filter((workspace) => includeScratch || !workspace.isScratch || workspace.id === workspaceId)
    .map((workspace) => ({ id: workspace.id, name: workspace.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // The selector always shows the filter in force, even before the list arrives or for an unknown id.
  if (workspaceId !== null && !workspaces.some((workspace) => workspace.id === workspaceId)) {
    workspaces.push({
      id: workspaceId,
      name: workspacesQuery.isPending ? t("common.state.loading") : t("dashboard.filters.unknownWorkspace"),
    });
  }

  function update(changes: { period?: DashboardPeriod; workspaceId?: number | null; includeScratch?: boolean }) {
    const next = { period, workspaceId, includeScratch, ...changes };
    const params: Record<string, string> = {};
    if (next.period !== DEFAULT_PERIOD) params.period = next.period;
    if (next.workspaceId !== null) params.workspace = String(next.workspaceId);
    if (next.includeScratch) params.scratch = "1";
    setSearchParams(params, { replace: true });
  }

  function renderContent() {
    if (dashboardQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    if (dashboardQuery.isError) {
      return <ErrorMessage>{t("common.state.error", { message: dashboardQuery.error.message })}</ErrorMessage>;
    }
    const dashboard = dashboardQuery.data;
    if (dashboard.totals.sessionCount === 0) return <EmptyState>{t("dashboard.state.empty")}</EmptyState>;
    return (
      <>
        <DashboardTotals totals={dashboard.totals} />
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("dashboard.rankings.title")}</h2>
          <div className={styles.sortRow}>
            <Field label={t("dashboard.rankings.sortBy")} error={null}>
              {(control) => (
                <Select
                  {...control}
                  value={agentSort}
                  onChange={(event) => setAgentSort(event.target.value === "tokens" ? "tokens" : "runs")}
                >
                  <option value="runs">{t("dashboard.rankings.sort.runs")}</option>
                  <option value="tokens">{t("dashboard.rankings.sort.tokens")}</option>
                </Select>
              )}
            </Field>
          </div>
          <RankingTable title={t("dashboard.rankings.agentTypes")} items={agentItems(dashboard.agentTypes, agentSort)} />
          <RankingTable title={t("dashboard.rankings.skills")} items={countItems(dashboard.skills)} />
          <RankingTable title={t("dashboard.rankings.tools")} items={countItems(dashboard.tools)} />
          <RankingTable title={t("dashboard.rankings.mcpServers")} items={countItems(dashboard.mcpServers)} />
          <RankingTable title={t("dashboard.rankings.models")} items={modelItems(dashboard.models)} />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("dashboard.activity.title")}</h2>
          <ActivityChart
            title={t("dashboard.activity.sessions")}
            formatValue={formatNumber}
            days={dashboard.days.map((day) => ({
              date: day.date,
              value: day.sessionCount,
              label: tp("dashboard.activity.sessionCount", day.sessionCount),
            }))}
          />
          <ActivityChart
            title={t("dashboard.activity.tokens")}
            formatValue={(value) => t("tokens.count.label", { count: formatTokens(value) })}
            days={dashboard.days.map((day) => ({ date: day.date, value: shown(day.tokens), label: tokenLabel(day.tokens) }))}
          />
        </section>
      </>
    );
  }

  return (
    <main className={styles.page}>
      <Panel>
        <header className={styles.header}>
          <Link className={styles.back} to={includeScratch ? "/?scratch=1" : "/"}>
            {t("dashboard.page.back")}
          </Link>
          <PageTitle>{t("dashboard.page.title")}</PageTitle>
        </header>
        <DashboardFilters
          period={period}
          workspaceId={workspaceId}
          includeScratch={includeScratch}
          workspaces={workspaces}
          onPeriodChange={(next) => update({ period: next })}
          onWorkspaceChange={(next) => update({ workspaceId: next })}
          onScratchChange={(next) => update({ includeScratch: next })}
        />
        {workspacesQuery.isError && (
          <ErrorMessage>{t("common.state.error", { message: workspacesQuery.error.message })}</ErrorMessage>
        )}
        <div className={dashboardQuery.isPlaceholderData ? `${styles.content} ${styles.isUpdating}` : styles.content}>
          {renderContent()}
        </div>
      </Panel>
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { DashboardPage as Component };
