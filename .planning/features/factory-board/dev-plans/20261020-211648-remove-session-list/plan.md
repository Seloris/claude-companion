# Factory boards: drop the factory session list

Feature: `factory-board` · Components: `web` · Spec: FR-28, FR-30, BR-04

## Context

The spec commit `9b16126` revised FR-28: a board draws no list of its `FactorySession`s and offers no `Clôturer`. The live page already shows the running sessions, each tile with its factory line (FR-31), and closes them with `Clôturer` (live-sessions FR-17). FR-30 no longer names a `FactorySession` line. BR-04 now says the `Clôturée` mark is made on the live page and only hides a session from the `Activité` (FR-27).

Today `FactoryBoardView` draws `FactorySessions` (`web/src/features/factory/ui/FactorySessions.tsx`) between the `Activité` and the live runs, on the factory page and in the workspace page's factory section (FR-08). This iteration removes that component and its `Clôturer` button. The rest stays as it is:

- `useClosedMarks` keeps working for the `Activité`: the factory page and the workspace section still read the marks, which the live page writes, and see a mark made in another tab through the hook's `storage` listener;
- the exported `board.sessions` stays read: `findSessionRun` (the `Activité`'s plan name, FR-30) and `factoryLines` (the live tile's factory line, FR-31) use it;
- FR-25's commit message and FR-26's `Récap` still show in the `Activité` and on the live run lines (`FactoryPendingCommit`, `FactoryRecapView` stay).

The plan's commit also carries a wording fix of the live-sessions spec (write-spec, called mode): BR-10 and the `Clôturée` glossary entry said the mark is shared with the factory sessions. They now say it is made on the live page and honoured by the factory board's `Activité`.

## Decisions

- **No api stage** → the contract is unchanged. `FactoryBoard.sessions` and the `FactorySession` schema still feed FR-30 and FR-31, and the OpenAPI document carries no description that mentions the list.
- **`FactoryClosedMarks`** → narrowed to `isClosed` only: `close` loses its last factory caller. The pages keep passing `useClosedMarks()`'s result; its `{ isClosed, close }` still satisfies the narrower type.
- **`toClosableSession`** → removed from `labels.ts`: `FactorySessions` was its only caller. `toClosableActivity` stays.
- **i18n** → `factory.sessions.label`, `factory.sessions.close` and `factory.sessions.closeLabel` are removed from `fr.json`.

## Decisions taken autonomously

- Run the grill on the plan? → yes, autonomous. Every question below took its recommended answer, and none had no recommendation.
- Branch → stay on `feat/factory-board-drop-session-list`, which holds the spec commit `9b16126` (not the base branch; the instruction for this run).
- Feature slug → `factory-board`, existing. The spec is `Approved` and already carries the revised FR-28, FR-30 and BR-04: no factory-board spec delta, no status change.
- Plan type and name → `remove-session-list`: a removal, commit type `refactor` for the stage (`planning.md`: `remove` → `refactor`).
- Does the api need a stage? → No. `sessions` is still read by the web (FR-30, FR-31), and `openapi.json` has no description of the list to fix.
- The api comments `// … phase always set by the mod (FR-28)` (`api/src/features/factory/factory.schema.ts:45`) and `// The mod always sets the phase of a session (FR-28)` (`api/src/features/factory/factory.source.ts:36`) now cite an FR-28 that says "no list" → left as they are (comment only, not worth an api stage and a handoff; the field they describe is unchanged). A reviewer should not raise them as new.
- live-sessions spec delta (write-spec, called mode, asked in the run's instruction) → `~ BR-10`: "One mark per session serves the live page and the factory sessions (factory-board BR-04): closing a session in either closes it in both." → "The mark is made on the live page only; the factory board's `Activité` honours it too (factory-board FR-27, BR-04), and the factory board offers no `Clôturer` of its own." `~ Glossary Clôturée`: "shared with the factory sessions (factory-board)" → "made on the live page and also honoured by the factory board's `Activité` (factory-board BR-04)". A line is added to that spec's Decisions taken autonomously. The spec stays `Approved`, `Last updated` already today.
- Keep `useClosedMarks()` on the factory page and the workspace section? → Yes: the `Activité` honours the mark (FR-27, BR-04); one instance per page, the `storage` listener brings a mark made on the live page in another tab.
- `FactoryClosedMarks`: keep `close` or narrow it? → Narrow to `isClosed` (no dead member; the prop name `closedMarks` stays to keep the diff small).
- `web/CLAUDE.md`'s `useClosedMarks.ts` line ("shared by the live page and the factory board") → reworded: made on the live page, honoured by the factory board's `Activité` (see Conventions).
- Stages → one, `web`. Review after it → yes (the autonomous default).
- Prepare step → kept (`web` declares `commands.prepare`); `src/api/schema.d.ts` must come out unchanged. If it changes, another session's uncommitted contract is in the working tree: the file is not staged.
- Web unit tests → none (`web/CLAUDE.md`); the browser test covers the stage.

## web

### data

- Prepare: `src/api/schema.d.ts` regenerated from `api/openapi.json`; expected unchanged. No other change in `data/`.

### pages

`src/features/factory/pages/FactoryPage.tsx` and `src/features/factory/pages/WorkspaceFactorySection.tsx`:

- keep `const closedMarks = useClosedMarks()` and the `closedMarks` prop passed down;
- reword the comment above it: `// BR-04: the Clôturée marks made on the live page, read once for the page (a mark made in another tab arrives through the storage event); the Activité honours them.` (the section's says "for the section").

### ui

- Delete `src/features/factory/ui/FactorySessions.tsx` and `src/features/factory/ui/FactorySessions.module.css`.
- `src/features/factory/ui/FactoryBoardView.tsx`:
  - drop the `FactorySessions` import and its JSX block (between `FactoryActivity` and `renderContent()`);
  - drop `toClosableSession` from the `./labels.ts` import;
  - the header comment no longer lists "its sessions (FR-28)": `// One board: its branch line (FR-10), its age (FR-11), its activity (FR-27), its live runs (FR-12), its filters (FR-14) and its cards by state.`
- `src/features/factory/ui/labels.ts`:
  - `FactoryClosedMarks` keeps `isClosed` only; its comment reads `// The Clôturée marks made on the live page (BR-04), read once per page and passed down to the Activité.`;
  - remove `toClosableSession` and its comment;
  - remove `FactorySession` from the `../data/factoryTypes.ts` type import if nothing else in the file uses it.
- `src/shared/lib/useClosedMarks.ts`: the header comment reads `// BR-10: the Clôturée marks, in this browser only, made on the live page and honoured by the factory board's Activité (factory-board BR-04).` (the next two lines, about the legacy key, stay). No code change.
- `src/shared/lib/i18n/fr.json`: remove `factory.sessions.label`, `factory.sessions.close`, `factory.sessions.closeLabel`.
- Unchanged and still used: `FactoryActivity`, `FactoryLiveRuns`, `FactoryPendingCommit`, `FactoryRecapView`, `FactoryRunSession`, `factoryLines.ts`, `findSessionRun`, `toClosableActivity`, the `--factory-phase-*` variables of `overrides.css`.
- Check after the change: `grep -rn "FactorySessions\|factory\.sessions\|toClosableSession" web/src` finds nothing.

## Conventions

- `web/CLAUDE.md`, Structure, the `lib/` line: `useClosedMarks.ts (the Clôturée marks of the sessions, kept by the browser, shared by the live page and the factory board)` → `useClosedMarks.ts (the Clôturée marks of the sessions, kept by the browser, made on the live page and honoured by the factory board's Activité)`. Rationale: the factory board no longer makes marks.

## Tests

### api

None: the api is not touched.

### web

None: `web/CLAUDE.md` has no unit tests on the front. The browser test of Validation checks the stage.

## Progress

### Stage 1 — web
Commit: `refactor(factory-board): web — drop the factory session list`
- [ ] Prepare: client regenerated from `api/openapi.json` (unchanged)
- [ ] pages: `FactoryPage` and `WorkspaceFactorySection` comments reworded; `useClosedMarks` kept
- [ ] ui: `FactorySessions.tsx` and its CSS deleted; `FactoryBoardView` without the list; `FactoryClosedMarks` narrowed to `isClosed`, `toClosableSession` removed; `useClosedMarks.ts` comment; `factory.sessions.*` keys removed
- [ ] Conventions: `web/CLAUDE.md` `useClosedMarks.ts` line reworded

## Validation

- [ ] Review: the `reviewer` agent on the plan's implementation, its findings settled
- [ ] Browser test: the change tested in `web` (`test-in-browser` skill). Scenarios, against the real `~/.claude/factory-board` (never written):
  - the factory page shows no session list and no `Clôturer` on any board; each board reads branch line, `Activité`, live runs, filters, cards;
  - a workspace page's factory section shows the same board, without the list;
  - a `job done` session that is the board's `Activité`: `Clôturer` on its live tile turns the `Activité` to `au repos`, with the factory page open in another tab and after navigating to the factory page in the same tab;
  - the `Activité` and the live run lines still show a pending commit message (FR-25) and a `Récap` (FR-26) when the export carries them;
  - the live page's tiles still show their factory line (FR-31);
  - no horizontal scroll at 375 px; both colour schemes are readable.
