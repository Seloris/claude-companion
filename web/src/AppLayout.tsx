import { useEffect, useMemo } from "react";
import { Outlet, useMatch, useSearchParams } from "react-router";
import { useLiveStateQuery } from "./features/live/data/useLiveStateQuery.ts";
import { useLiveNotifications } from "./features/live/pages/useLiveNotifications.ts";
import { columnCounts, flattenWorkspaces } from "./features/live/ui/board.ts";
import { useRefreshStatusQuery } from "./features/refresh/data/useRefreshStatusQuery.ts";
import { t, tp } from "./shared/lib/i18n/index.ts";
import { NavBar, type NavBarBadge, type NavBarItem } from "./shared/ui/NavBar.tsx";

// The shared navigation around every page (FR-14).
export function AppLayout() {
  const [searchParams] = useSearchParams();
  const scratchSuffix = searchParams.get("scratch") === "1" ? "?scratch=1" : "";
  const isLivePage = useMatch("/live") !== null;
  const liveQuery = useLiveStateQuery({ isPolling: true });
  // FR-27: every page of the application notifies, since the layout is the one that polls the live state everywhere.
  useLiveNotifications(liveQuery);
  // The refresh the API starts when a live session ends (FR-13) is followed from every page, so that its end reloads the recap.
  useRefreshStatusQuery();

  // No count while loading, on error, on an unreadable folder or when nothing runs or waits; the counts never follow the
  // live page's workspace filter. FR-14, BR-20: `Vous attend` holds the commits to validate too, so the counts are the
  // columns', computed from the sessions, not the api's live-status counts.
  const data = liveQuery.isError ? undefined : liveQuery.data;
  const counts = useMemo(
    () => (data !== undefined && data.isSessionsDirReadable ? columnCounts(flattenWorkspaces(data)) : undefined),
    [data],
  );
  const awaitingCount = counts?.awaiting ?? 0;
  const runningCount = counts?.running ?? 0;
  const liveBadges: NavBarBadge[] = [];
  if (awaitingCount > 0) {
    liveBadges.push({ count: awaitingCount, label: tp("layout.nav.liveAwaiting", awaitingCount), tone: "attention" });
  }
  if (runningCount > 0) {
    liveBadges.push({ count: runningCount, label: tp("layout.nav.liveRunning", runningCount), tone: "default" });
  }
  const items: NavBarItem[] = [
    { to: `/${scratchSuffix}`, label: t("layout.nav.workspaces") },
    { to: `/dashboard${scratchSuffix}`, label: t("layout.nav.dashboard") },
    { to: "/live", label: t("layout.nav.live"), badges: liveBadges },
    { to: "/factory", label: t("layout.nav.factory") },
  ];

  // FR-14: the browser tab says how many sessions wait for the person, so that it shows from another tab.
  useEffect(() => {
    document.title = awaitingCount > 0 ? t("layout.title.awaiting", { count: awaitingCount }) : t("layout.title.base");
  }, [awaitingCount]);

  return (
    <>
      <NavBar label={t("layout.nav.label")} brand={t("layout.nav.brand")} items={items} isWide={isLivePage} />
      <Outlet />
    </>
  );
}
