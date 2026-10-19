import { Outlet, useSearchParams } from "react-router";
import { useLiveStateQuery } from "./features/live/data/useLiveStateQuery.ts";
import { useRefreshStatusQuery } from "./features/refresh/data/useRefreshStatusQuery.ts";
import { t, tp } from "./shared/lib/i18n/index.ts";
import { NavBar, type NavBarItem } from "./shared/ui/NavBar.tsx";

// The shared navigation around every page (FR-14).
export function AppLayout() {
  const [searchParams] = useSearchParams();
  const scratchSuffix = searchParams.get("scratch") === "1" ? "?scratch=1" : "";
  const liveQuery = useLiveStateQuery({ isPolling: true });
  // The refresh the API starts when a live session ends (FR-13) is followed from every page, so that its end reloads the recap.
  useRefreshStatusQuery();

  // No badge while loading, on error or when nothing runs or waits.
  const counts = liveQuery.isError ? undefined : liveQuery.data?.counts;
  const activeCount = counts === undefined ? 0 : counts.running + counts.awaitingAnswer;
  const items: NavBarItem[] = [
    { to: `/${scratchSuffix}`, label: t("layout.nav.workspaces") },
    { to: `/dashboard${scratchSuffix}`, label: t("layout.nav.dashboard") },
    {
      to: "/live",
      label: t("layout.nav.live"),
      ...(activeCount > 0 ? { badge: { count: activeCount, label: tp("layout.nav.liveBadge", activeCount) } } : {}),
    },
  ];

  return (
    <>
      <NavBar label={t("layout.nav.label")} items={items} />
      <Outlet />
    </>
  );
}
