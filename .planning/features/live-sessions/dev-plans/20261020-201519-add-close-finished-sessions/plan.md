# Close finished sessions

Feature: `live-sessions` · Components: `web` · Spec: FR-01, FR-07, FR-15, FR-17, FR-25, BR-07, BR-09, BR-10, BR-13, BR-17, BR-19 (glossary `Finished`, `Closed`)

## Context

The spec revision (commit a2d94ae) replaces `Vu` with `Clôturer` and drops the 15-minute rule:

- a finished session stays in `Terminées` until the person closes it (FR-17, BR-09); `RECENTLY_FINISHED_MS` goes;
- a `Clôturée` mark covers the turns ended before it, not one turn by equality (BR-10);
- one mark per session is shared with the factory board (factory-board BR-04): the marks hook moves to `src/shared/lib/` so that the factory feature can use it in its own later plan;
- marks are forgotten a month after they were made, no longer when the session leaves the live state (BR-10);
- a `Tour terminé` notification fires only for a turn that ended after the previous read (BR-19): without the 15-minute window, a session seen for the first time or seen again after a read that missed it would otherwise notify an old turn.

No api change: `GET /v1/live` already returns `readAt` (the server's read time, same clock as `statusSince`), `statusSince` and `turnStartedAt`. The api stage is skipped; `api/openapi.json` is unchanged.

Renames in code: `Seen` → `Closed`, `RecentlyFinished` → `Finished` (bucket `recentlyFinished` → `finished`, notification kind `recentlyFinished` → `finished`). The column id is already `finished` in `LiveBoard`, `LiveColumn`, `StatusPill` and the notification settings.

## Decisions

- Scope → `web` only, one stage; the factory-board spec (commit 6ba1f89) is a later plan. This plan only makes the shared hook usable by it (an input that names a turn's end, no live type in its signature); no factory-board code changes.
- Storage key → kept `claude-companion.live.seen`, so that the sessions already marked stay closed (caller's request). Its name is no longer accurate; a comment says why it stays.

## Decisions taken autonomously

The grill was run in autonomous mode. Every question took its recommended answer:

- Grill on the plan → run in autonomous mode, without offering it (skill's autonomous default)
- Stage order and review → the manifest's order (`web` only, `api` untouched); a review after the stage (autonomous default)
- Branch → stay on `feat/factory-board-session-phases`, which holds the spec commit (caller's request; not the base branch, so no branch is created)
- What the mark records → the moment it was made (`closedAt`), raised to the closed turn's end when that end is later (a guard; both clocks are this machine's). A session is closed while its latest turn ended at or before `closedAt` (BR-10 says the mark covers the turns ended before it). Storing the closed turn's own end time instead was rejected: the factory board reads its turn ends from the mod's export, a few milliseconds off the live state's `statusSince`, so a mark made on one page would not close the session on the other
- A live session's turn end → its `statusSince` while it is `Idle` with a turn whose start is not after it (the same test `bucketOf` makes today); none otherwise
- The marks already stored (value = the closed turn's `turnStartedAt`) → kept as legacy entries, read with their own rule: closed while the session's `turnStartedAt` is at or before the stored value. A newer turn starts after the old turn ended, so it is `Finished` again. The new rule cannot read them: the closed turn ended after its start, so it would come back
- Storage shape → `{ [sessionId]: { closedAt: string } | string }`, the string being a legacy entry. Closing a session again replaces its legacy entry with an object
- "A month" → 30 days (`CLOSED_MARK_TTL_MS`). A legacy entry is dated by its stored `turnStartedAt`, the only date it has: it may go a little before a month after the click
- When marks are pruned → when the hook reads the storage (mount, another tab's `storage` event) and when it writes; never against a read of the live state. `prune` and the `LivePage` effect that called it go
- Hook location and name → `src/shared/lib/useClosedMarks.ts`, beside `useNow.ts` and `useClipboard.ts`: it holds no live word, so the factory feature reuses it as it is
- Baseline read time for BR-19 → the live state's `readAt` (server clock, the clock of `statusSince`), not `dataUpdatedAt` (the browser's receipt time)
- Notification dedupe by `turnStartedAt` → kept beside the BR-19 test: a `statusSince` moved by Claude Code without a new turn would otherwise notify the same turn again
- `Clôturer` button icon → `CheckIcon` (shared) instead of `EyeIcon`. `EyeIcon` stays in `icons.tsx`, unused by this feature
- Review finding: a mark keyed on `statusSince` reopens a session whose idle `statusSince` moves without a new turn → kept as planned (BR-10 keys the mark on the turn's end; the real status files keep `statusUpdatedAt` apart from a rename); to revisit if seen in the browser test
- Review finding: `Clôturer` on a stale tile also closes a turn that ended after the last poll → kept (BR-10 letter, rare)
- Tests → none. `web/CLAUDE.md` forbids unit tests on the front, and no `bucketOf` or notification test exists to update (the caller expected some that pin 15 minutes). The missing-then-back case of BR-19 is reasoned out in the `notifications.ts` section and stays a manual browser scenario

## web

### data

- **Move** `src/features/live/data/useSeenMarks.ts` to `src/shared/lib/useClosedMarks.ts` (`git mv`, then rewrite), exporting `useClosedMarks`.
  - `STORAGE_KEY = "claude-companion.live.seen"` stays, with a comment: the key predates `Clôturer` and is kept so that the marks already made stay.
  - `export const CLOSED_MARK_TTL_MS = 30 * 24 * 60 * 60_000` (BR-10: a month).
  - Stored entry: `type StoredMark = { closedAt: string } | string`. The string form is a legacy `Vu` mark holding the closed turn's `turnStartedAt`. `readMarks()` keeps only entries of either shape with a parseable date and drops those older than `CLOSED_MARK_TTL_MS` against `Date.now()`. When it dropped any, it writes the rest back, guarded like every access today.
  - Input of the checks: `export interface Closable { sessionId: string; turnEndedAt: string | null; turnStartedAt?: string | null }`. `turnStartedAt` is read only against a legacy entry; a caller without it (the factory board) gets no legacy match.
  - `isClosed(session: Closable): boolean`:
    - no entry, or `turnEndedAt === null` → false;
    - object entry → `turnEndedAt <= closedAt`, compared as times;
    - legacy entry → `turnStartedAt != null && turnStartedAt <= entry`.
  - `close(sessions: Closable[])`: merges onto `readMarks()` as today (another tab's marks are kept), and sets each session with a `turnEndedAt` to `{ closedAt: max(now, turnEndedAt) }` as an ISO string. Then it updates the state and writes.
  - The `storage` listener stays (another tab's close shows here). `prune` is removed.
  - Header comment: BR-10, shared by the live page and the factory board (factory-board BR-04).
- `src/features/live/data/useSeenMarks.ts` is deleted by the move.

### pages

- `LivePage.tsx`:
  - imports `useClosedMarks` from `../../../shared/lib/useClosedMarks.ts`; `const marks = useClosedMarks()`;
  - removes the prune effect and its comment;
  - `buildColumns(visible, { isClosed: marks.isClosed, enteredAt: tracking.enteredAt })`, without `now`;
  - `columns.finished = buckets.finished`;
  - `finishedIds` reads `buckets.finished`;
  - `LiveBoard` gets `onClose={(session) => marks.close([session])}` and `onCloseAll={() => marks.close(buckets.finished)}`.
  - Each closable is the `BoardSession` mapped with `turnEndedAt: turnEndedAt(session)` and its `turnStartedAt` (see `board.ts`). `board.ts` exports a `toClosable(session)` helper for that, used here and by `bucketOf`.
- `useLiveNotifications.ts`:
  - calls `trackNotifications(baselineRef.current, sessions, data.readAt)`;
  - the comment of `show` says `without closing the session (BR-17)` instead of `Vu`.
  - Nothing else changes: leader lock, withdraw, switches.

### ui

- `board.ts`:
  - `Bucket = "awaiting" | "running" | "finished" | "idle"`; `BoardColumns.recentlyFinished` → `finished`.
  - `RECENTLY_FINISHED_MS` and its comment are removed.
  - New `export function turnEndedAt(session: BoardSession): string | null`: `statusSince` when `status === "idle"`, `turnStartedAt !== null` and `turnStartedAt` is not after `statusSince`; else null. It keeps the comment about a built-in command (`/model`) that leaves the status as it is.
  - New `export function toClosable(session: BoardSession): Closable` (type imported from the shared hook): `{ sessionId, turnEndedAt: turnEndedAt(session), turnStartedAt }`.
  - `bucketOf(session, { isClosed })`, where `isClosed` is `(session: Closable) => boolean`:
    - `awaitingAnswer` → `awaiting`; `running` → `running`;
    - `turnEndedAt(session) === null` → `idle`;
    - else `isClosed(toClosable(session)) ? "idle" : "finished"`.
    - Comment: BR-09, however long ago the turn ended.
  - `buildColumns(sessions, { isClosed, enteredAt })`, no `now`; `finished` sorted by `statusSince`, most recent first (FR-15). The comment names `Terminées`.
- `notifications.ts`:
  - `LiveNotificationKind = "awaitingAnswer" | "finished"`.
  - `NotificationBaseline = { readAt: string; sessions: Map<string, { status; question; turnStartedAt }> }`. `trackNotifications(baseline, sessions, readAt: string)` returns `{ baseline: { readAt, sessions: next }, notifications }`.
  - `Tour terminé` (BR-19, FR-25): with `const ended = turnEndedAt(session)`, notify `finished` when all of these hold:
    - the session is not `awaitingAnswer`;
    - `ended !== null` and `ended` is after `baseline.readAt`;
    - and either `before === undefined`, or `before.status !== "idle"`, or `before.turnStartedAt !== session.turnStartedAt`.
  - Marks are not read (a turn ended after the last read cannot be closed yet).
  - This covers the cases:
    - a session first seen, or seen again after a read that missed it, whose turn ended before the previous read, notifies nothing;
    - one whose turn ended between the two reads notifies once;
    - the log-missing branch (the question and the turn kept from the baseline) is unchanged: a read without the log has `turnStartedAt === null`, hence no turn end and no notification, and the read that finds the log again finds the same `turnStartedAt` and a turn end before the previous read.
  - The header comment: drop the 15-minute line; `readAt` is the live state's own read time, compared with the turn's end (BR-19). The `bucketOf` import goes.
  - `notificationText` checks `kind === "awaitingAnswer"` as today. The turn duration keeps using `statusSince - turnStartedAt`.
- `LiveBoard.tsx`:
  - props `onMarkSeen` → `onClose(session)`, `onMarkAllSeen` → `onCloseAll()`;
  - the footer button reads `t("live.column.closeAll")`;
  - the tile gets `onClose`.
- `LiveSessionTile.tsx`: prop `onMarkSeen` → `onClose`; the finished button reads `t("live.tile.close")`, `aria-label={t("live.tile.closeLabel", { title })}`, with `<CheckIcon />` in place of `<EyeIcon />`.
- `IdleGroup.tsx`: the FR-07 comment says "not finished" instead of "not recently finished".
- `src/shared/lib/i18n/fr.json`:
  - `live.column.finished.title` → `"Terminées"`;
  - `live.column.finished.caption` → `"Tour fini — à relire, puis à clôturer"`;
  - `live.column.markAllSeen` → renamed `live.column.closeAll`: `"Tout clôturer"`;
  - `live.tile.seen` → renamed `live.tile.close`: `"Clôturer"`;
  - `live.tile.seenLabel` → renamed `live.tile.closeLabel`: `"Clôturer : {title}"`;
  - `live.column.finished.empty` and `live.status.finished` (`"Terminée"`) are unchanged.
- Final check: `grep -rn "Seen\|seen\|RecentlyFinished\|recentlyFinished\|RECENTLY_FINISHED\|Vu\b" src` lists nothing of this feature. The storage key string and unrelated uses (`useStatusTracking`, `useRefreshStatusQuery`) stay.

## Conventions

- `web/CLAUDE.md`, Structure, the `lib/` line: add `useClosedMarks.ts (the Clôturée marks of the sessions, kept by the browser, shared by the live page and the factory board)`. Why: a shared hook that two features read needs to be found from the component's map.

## Tests

- **web**: none. The component has no unit tests (`web/CLAUDE.md`); the browser test below covers it.
- **api**: none (untouched).

## Deviations

- Notification test `ended` after `baseline.readAt` for every session → applied only to a session the baseline does not know (first seen, or back after a read that missed it); a known session keeps the transition rule (`before.status !== "idle"` or another `turnStartedAt`) (the api stamps `readAt` after reading the files, so a turn ending during the previous read would never notify; review finding)

## Progress

### Stage 1 — web
Commit: `feat(live-sessions): web — Clôturer replaces Vu, no 15-minute rule`
- [x] Prepare: client regenerated from `api/openapi.json`
- [x] data: `useSeenMarks` moved to `src/shared/lib/useClosedMarks.ts` (`closedAt` marks, legacy entries, 30-day prune, no live prune)
- [x] pages: `LivePage` on `useClosedMarks`, prune effect removed; `useLiveNotifications` passes `readAt`
- [x] ui: `board.ts` (`finished` bucket, `turnEndedAt`, `toClosable`, no 15 minutes); `notifications.ts` (BR-19 baseline read time, kind `finished`); `LiveBoard`, `LiveSessionTile`, `IdleGroup`; `fr.json` keys
- [x] Conventions: `web/CLAUDE.md` Structure names `useClosedMarks.ts`

## Validation

- [x] Review: the `reviewer` agent on the plan's implementation, its findings settled
- [-] Browser test: not run (autopilot without browser test). Scenarios:
  - a session that finishes a turn shows in `Terminées` and stays there past 15 minutes;
  - `Clôturer` moves it to the idle group, and so does `Tout clôturer` for the whole column; a reload keeps it there;
  - the session runs a new turn and finishes: it is back in `Terminées`;
  - a session marked `Vu` before this change (an entry in `claude-companion.live.seen` holding its `turnStartedAt`) stays in the idle group;
  - a mark dated more than 30 days ago is dropped from the storage when the page loads;
  - with `Tour terminé` on, a turn ending while a page is open notifies once; opening a page with finished sessions notifies nothing;
  - a session missing from one read and back in the next (its log busy, or the folder briefly unreadable) does not notify its old turn.
