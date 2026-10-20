import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { formatDuration } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import { usePromptSwitches } from "../../../shared/lib/promptSwitches.ts";
import { useClosedMarks } from "../../../shared/lib/useClosedMarks.ts";
import { useNow } from "../../../shared/lib/useNow.ts";
import { Disclosure } from "../../../shared/ui/Disclosure.tsx";
import { EmptyState } from "../../../shared/ui/EmptyState.tsx";
import { ErrorMessage } from "../../../shared/ui/ErrorMessage.tsx";
import { LoadingState } from "../../../shared/ui/LoadingState.tsx";
import { PageTitle } from "../../../shared/ui/PageTitle.tsx";
import { Switch } from "../../../shared/ui/Switch.tsx";
import { setCompactMode, useCompactMode } from "../data/compactMode.ts";
import { requestNotificationPermission, useNotificationPermission } from "../data/notificationPermission.ts";
import { setNotificationSettings, useNotificationSettings } from "../data/notificationSettings.ts";
import { useLiveStateQuery } from "../data/useLiveStateQuery.ts";
import { buildColumns, flattenWorkspaces, tileState, toClosable, workspaceChoices, type BoardSession } from "../ui/board.ts";
import { CompactBoard } from "../ui/CompactBoard.tsx";
import { IdleGroup } from "../ui/IdleGroup.tsx";
import { pillLabel } from "../ui/labels.ts";
import { LiveBoard, type ColumnId } from "../ui/LiveBoard.tsx";
import { NotificationSettings } from "../ui/NotificationSettings.tsx";
import { WorkspaceFilter } from "../ui/WorkspaceFilter.tsx";
import styles from "./LivePage.module.css";
import { useStatusTracking } from "./useStatusTracking.ts";

// The "since" labels and durations show seconds, so they tick every second, between two polls.
const NOW_TICK_MS = 1000;

// FR-28: a click on a notification opens this page with the workspace of its session in the navigation state.
function readWorkspaceState(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("workspace" in state)) return null;
  return typeof state.workspace === "string" ? state.workspace : null;
}

function LivePage() {
  const liveQuery = useLiveStateQuery({ isPolling: false });
  const now = useNow(NOW_TICK_MS);
  const marks = useClosedMarks();
  const permission = useNotificationPermission();
  const notificationSettings = useNotificationSettings();
  const location = useLocation();
  const requestedWorkspace = readWorkspaceState(location.state);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(requestedWorkspace);
  // FR-28: a click while this page is open is a new navigation (a new key), applied once, during render, so that the
  // page never shows the old filter for a frame.
  const [appliedKey, setAppliedKey] = useState(location.key);
  if (location.key !== appliedKey) {
    setAppliedKey(location.key);
    if (requestedWorkspace !== null) setSelectedWorkspace(requestedWorkspace);
  }
  const [selectedTab, setSelectedTab] = useState<ColumnId>("awaiting");
  // FR-39, BR-22: the compact mode, kept by the browser. FR-38: the prompt switches the factory page sets.
  const isCompact = useCompactMode();
  const switches = usePromptSwitches();

  const live = liveQuery.data;
  // Every live session of the last read, never a filtered list: the tracking is kept against it.
  // A folder that cannot be read says nothing about the sessions: it gives no list.
  const readable = useMemo(
    () => (live !== undefined && live.isSessionsDirReadable ? flattenWorkspaces(live) : null),
    [live],
  );
  const all = readable ?? [];
  // FR-01, FR-32: a session's column and pill, its factory job (on the live state, `factory`) included.
  const stateOf = (session: BoardSession) => tileState(session, { isClosed: marks.isClosed });
  const tracking = useStatusTracking(readable, liveQuery.dataUpdatedAt, now, stateOf);

  const choices = workspaceChoices(all);
  // A filtered workspace that left the live state falls back to every workspace.
  const filter = choices.some((choice) => choice.key === selectedWorkspace) ? selectedWorkspace : null;
  const visible = filter === null ? all : all.filter((session) => session.workspace.key === filter);
  const buckets = buildColumns(visible, { isClosed: marks.isClosed, enteredAt: tracking.enteredAt });
  const columns = { awaiting: buckets.awaiting, running: buckets.running, finished: buckets.finished };

  // FR-18: what a screen reader hears for a change is what the tile shows: its pill.
  const visibleIds = new Set(visible.map((session) => session.sessionId));
  const announcements = tracking.changes
    .filter((change) => visibleIds.has(change.sessionId))
    .map((change) => t("live.announce.change", { title: change.title, status: pillLabel(change.pill) }));
  const boardProps = {
    columns,
    now,
    isHighlighted: tracking.isHighlighted,
    stateOf,
    switches,
    onClose: (session: BoardSession) => marks.close([toClosable(session)]),
    onCloseAll: () => marks.close(buckets.finished.map(toClosable)),
  };

  function renderContent() {
    if (liveQuery.isPending) return <LoadingState>{t("common.state.loading")}</LoadingState>;
    // A failed poll replaces the sessions: the page never keeps showing a state it can no longer read (FR-12).
    if (liveQuery.isError) {
      return <ErrorMessage>{t("common.state.error", { message: liveQuery.error.message })}</ErrorMessage>;
    }
    if (live === undefined) return null;
    if (!live.isSessionsDirReadable) {
      return <ErrorMessage>{t("live.state.unreadable", { dir: live.sessionsDir })}</ErrorMessage>;
    }
    if (all.length === 0) return <EmptyState>{t("live.state.empty")}</EmptyState>;
    return (
      <>
        {isCompact ? (
          <CompactBoard {...boardProps} />
        ) : (
          <LiveBoard {...boardProps} selected={selectedTab} onSelect={setSelectedTab} />
        )}
        <IdleGroup sessions={buckets.idle} now={now} />
        {/* FR-18: each status change is announced to a screen reader. */}
        <div className={styles.srOnly} role="status" aria-live="polite">
          {announcements.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      </>
    );
  }

  const isShowingSessions = live !== undefined && live.isSessionsDirReadable && !liveQuery.isError;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <PageTitle>{t("live.page.title")}</PageTitle>
          {isShowingSessions && all.length > 0 && (
            <p className={styles.summary}>
              {t("live.page.summary", {
                sessions: tp("live.page.sessions", all.length),
                projects: tp("live.page.projects", choices.length),
              })}
            </p>
          )}
        </div>
        <div className={styles.bar}>
          {isShowingSessions && (
            // FR-21: how long ago the page read the live state.
            <p className={styles.summary}>
              {t("live.page.updated", { duration: formatDuration(Math.max(0, now.getTime() - liveQuery.dataUpdatedAt)) })}
            </p>
          )}
          <Switch label={t("live.compact.label")} checked={isCompact} onChange={setCompactMode} />
          {/* FR-23: the notification settings, folded in the page's bar until opened. */}
          <div className={styles.notifications}>
            <Disclosure summary={t("live.notify.heading")}>
              <NotificationSettings
                permission={permission}
                settings={notificationSettings}
                onEnable={requestNotificationPermission}
                onChange={setNotificationSettings}
              />
            </Disclosure>
          </div>
        </div>
      </header>
      {isShowingSessions && all.length > 0 && (
        <WorkspaceFilter choices={choices} total={all.length} selected={filter} onSelect={setSelectedWorkspace} />
      )}
      {renderContent()}
    </main>
  );
}

// React Router's lazy routes read the page from the module's `Component` export.
export { LivePage as Component };
