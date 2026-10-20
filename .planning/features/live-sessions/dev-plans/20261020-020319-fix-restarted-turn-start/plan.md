# Turn restarted without a prompt

Feature: `live-sessions` · Components: `api` · Spec: FR-16, BR-09, BR-10, BR-11 (glossary `Turn` broadened)

## Context

Follow-up of `../20261020-004645-add-status-board`, which left open point 4 of its stage 1: when Claude Code restarts Claude by itself in an idle session (a background task's `<task-notification>`, a message from another session), no `Prompt` is written, so the api's `turnStartedAt` stays on the last prompt. The web keys the `Vu` mark on `turnStartedAt` (BR-10): the new turn shows under the old mark and stays hidden in the idle group. The same stale start makes "Tour de" (`statusSince − turnStartedAt`) count from the old prompt, and `lastReply` may show the previous turn's text when the restarted turn wrote none (BR-11).

The spec's glossary now says a `Turn` also starts at such a restart. This plan moves `turnStartedAt` to the start of the latest turn, whatever started it; the web needs no change (its mark key, bucket and duration all read `turnStartedAt`).

It also settles the status board's last open review remark: `statusSince` falling back to the status file's `updatedAt`.

## Decisions

Grill not run: the facts below were checked on the logs and status files of this machine (Claude Code 2.1.299) before planning.

- What marks a turn's start in the log → a user line of the main log with a `turnOrigin` field (`human`, `sdk`, `system`, `peer`, `task_notification`; Claude Code ≥ 2.1.288 writes it, with `turnPosition`). A `<task-notification>` that only records a notification in the transcript (`queueTranscriptOnly: true`) has no `turnOrigin`: in every case found, the turn starts at the next line that has one. Built-in commands (`/model`, `/compact`, `/reload-plugins`) carry none.
- `turnStartedAt` → the latest of the last prompt's `sentAt` and the timestamp of the latest main-log user line with a `turnOrigin` (sidechain lines skipped); null when neither exists. The latest by time, not by position: lines copied before a compaction keep their old timestamp. Older logs without `turnOrigin` keep the last prompt (today's behaviour).
- Peer messages (`turnOrigin: "peer"`, written `isMeta`) → covered by the same rule: they restart Claude like a notification does, and the glossary names both.
- `lastReply` → scoped to that same turn start instead of the last prompt, so a restarted turn without text has none (BR-11) instead of the previous turn's text. Still null when there is no turn start.
- `lastPrompt` and the service's resumed-session check (`turnStartedAt >= startedAt` of the process) → unchanged. A notification turn after a `--resume` now counts as a turn since the process started, as BR-09 says.
- Web `bucketOf` mitigation for a built-in command moving `turnStartedAt` → left as is: built-in commands are still prompts (`prompts.at(-1)`).
- Re-keying the `Vu` mark on `statusSince` instead (web only) → rejected: it would show the tile again but keep a wrong "Tour de" and a stale `lastReply`.
- `statusSince` falling back to `updatedAt` when `statusUpdatedAt` is missing (status board review remark) → no change: not a heartbeat. All 21 status files on this machine carry `statusUpdatedAt`, so the fallback never runs on the current Claude Code; no file's `updatedAt` or `statusUpdatedAt` moved over a 60 s sample; idle files hours old still have `updatedAt === statusUpdatedAt`. `updatedAt` only moves apart while busy (377 ms in one file), which is why `statusUpdatedAt` is read first. On an older Claude Code without `statusUpdatedAt`, `updatedAt` is the last write of the file, not a periodic beat.

## api

### services

- `src/features/live/live.log.ts`:
  - a loose schema for a turn-starting user line: `type: "user"`, `timestamp`, `turnOrigin: z.string()`, `isSidechain` optional; next to `userTextSchema`.
  - `readTurnStart(main, prompt)`: the latest of `prompt?.sentAt` and the timestamps of the main lines matching that schema with `isSidechain !== true`; null when neither. Comment: why `turnOrigin` (a restart writes no prompt) and why the latest by time (copied lines).
  - `readLiveLog`: `turnStartedAt = readTurnStart(...)`; `lastReply = turnStartedAt === null ? null : readLastReply(main, turnStartedAt)`.
  - `LiveLog.turnStartedAt` comment: the start of the latest turn, a prompt or a restart by Claude Code (a background task's notification, another session's message); null before the first. `lastReply` comment: "since the turn started".

### routes

- `src/features/live/live.schema.ts`: the comment of `turnStartedAt` becomes "The latest turn's start: the last prompt, or Claude Code restarting Claude (a background task's notification, another session's message); null before the first turn." The field and its type are unchanged.
- Handoff: `npx tsx scripts/export-openapi.ts openapi.json` (the description changes).

## Tests

- **api**, unit (`test/live/live.log.test.ts`, `describe("turn")`); `test/live/live-builders.ts` gains `restartLine(origin, text, second)` for a user line written the way Claude Code writes a restart (`origin.kind` `task-notification` with `turnOrigin: "task_notification"`, or `peer`, `isMeta`, with `turnOrigin: "peer"`), and an option for a transcript-only notification (no `turnOrigin`, `queueTranscriptOnly: true`):
  - `it("starts the turn at a background task's notification that restarted Claude")`;
  - `it("starts the turn at a message from another session that restarted Claude")`;
  - `it("does not start a turn at a notification only recorded in the transcript")`;
  - `it("takes the last reply from the turn a notification restarted")`;
  - `it("has no last reply when the turn a notification restarted wrote no text")` (the previous turn wrote text);
  - `it("keeps the latest start when an older restart line comes after the last prompt")` (a copied line).
- **api**, routes (`test/live/live.routes.test.ts`): `it("moves the turn start to a notification that restarted Claude")`.
- **web**: none (no web change; its build and lint run against the regenerated client in Validation).

## Deviations

- Handoff "the description changes" → `api/openapi.json` unchanged (the field comments of `live.schema.ts` are code comments, not OpenAPI descriptions; the export ran and wrote an identical file). The `lastReply` comment of `live.schema.ts` was also reworded ("null without a turn or text"), as the review found it stale.
- Decisions say built-in commands carry no `turnOrigin` → the review found `/doctor` written with `turnOrigin: "human"`. No code change: built-in commands were already prompts and moved `turnStartedAt` before this plan, and the web's `bucketOf` mitigation covers them.

## Progress

### Stage 1 — api
Commit: `fix(live-sessions): api — turn restarted without a prompt`
- [x] services: `readTurnStart` in `live.log.ts`, `lastReply` scoped to it, with their tests
- [x] routes: `turnStartedAt` description, route test
- [x] Handoff: `api/openapi.json` exported

## Validation

- [x] Review: the `reviewer` agent on the plan's implementation, its findings settled
- [x] Tests: the full `test` command of `api` green on the plan's final code
- [x] Web: client regenerated from `api/openapi.json`, `npm run build` and lint clean
