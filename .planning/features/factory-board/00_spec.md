# Factory board (tableau factory) — PRD

> **Slug**: `factory-board`
> **Tags**: #factory
> **Status**: Approved
> **Last updated**: 2026-10-20

## TL;DR

The projects built with the factory workflow have a factory board inside Claude Code (the factory-board mod's pane): their features, the plan timeline of each, and the factory sessions at work. It is visible only inside a Claude Code session of that one project. This feature shows every project's board in the application, with each project's workspace, and draws it as the pane does. The board is read from the export the mod writes, and the application only draws it, with where each factory session stands for the person: at work, waiting for a commit's yes or another answer, its job done with its recap, or interrupted.

## Problem

The person drives several factory projects at once, often through autopilots and side sessions. To know which feature is at which stage, which session is working on it and what the next command is, they must open a Claude Code session in each project and open its pane. Nothing gives the cross-project view, and nothing shows a project's board while no session of it is open.

## Non-goals

- Acting on a project: the application never writes a plan, a spec, `factory.yaml` or the board, never fills a Claude Code prompt box and never starts a session; it copies prompts to the clipboard only.
- Recomputing the board: the states, the markers, the steps' runs, the live runs and the prompts are the mod's; the application draws them as exported, without correcting them.
- The pane's controls that write or that the export does not carry: the plan picker (only the default plan's timeline is exported), `Nouvelle feature`, `Squasher`, the models screen, `Marquer comme fait`, the rescan.
- Drawing the factory data on the live page: its tiles' pill, band, callouts, columns, order and `Clôturer` are `live-sessions`' (its FR-32 to FR-40, BR-20 to BR-22); this feature only says which run a tile shows (FR-31), and the folded `Idle` group carries no factory band.
- A list of the factory sessions on the board: the live page shows the running ones, each tile with its factory band (FR-31), and closes them with `Clôturer` (live-sessions FR-17).
- Making the board fresher than the mod writes it (every 10 seconds, after a commit and at each turn's end): a faster rescan is a change of the mod.

## Domain Glossary

| Business term | Identifier | Business meaning | Status |
|---|---|---|---|
| `Workspace` | `Workspace` | A real folder in which Claude Code sessions ran; a repository's worktrees and case variants of its path belong to it | Reused |
| `Session` | `Session` | One Claude Code conversation, from one log file, with its subagents | Reused |
| `Tableau factory` | `FactoryBoard` | The board of one project root (a checkout or a worktree), as the factory-board mod exports it at each scan | New |
| `Feature factory` | `FactoryFeature` | A feature of a `FactoryBoard`: its state, its timeline on the plan the mod follows, and the prompt of its next step | New |
| `État de feature` | `FactoryFeatureState` | Where a `FactoryFeature` stands: `Sans spec`, `Spec seule`, `Plan prêt`, `En cours`, `À valider`, `Finalisée` | New |
| `Étape` | `TimelineStep` | One row of a feature's timeline (`Spec`, `Plan`, one per stage, `Revue finale`), with its marker: done, running, next or pending | New |
| `Run` | `FactoryRun` | One session working on one `TimelineStep` of one feature, with its command and status (`en cours`, `attend une réponse`, `terminé`, `interrompu`), kept as history once over | New |
| `Prompt suivant` | `NextPrompt` | The factory command the mod prepares for a feature's next step, with its chained and autopilot variants | New |
| `Phase` | `FactoryPhase` | Where a factory session stands for the person at the end of its last turn: `au travail`, `attend la validation du commit`, `attend une réponse`, `job done`, `interrompue` | New |
| `Activité` | `FactoryActivity` | A project's state at a glance: the factory session that most needs the person (a commit to validate, then another answer, then a turn at work), else the latest; `au repos` without any | New |
| `Récap` | `FactoryRecap` | What a session's job done says it did: its short recap line and its commits | New |
| `Session factory` | `FactorySession` | A session's latest `FactoryRun` of its main conversation, as the mod lists it for a month | New |
| `Session en direct` | `LiveSession` | A session running on this machine, drawn as a tile on the live page (live-sessions) | Reused |
| `Clôturée` | `Closed` | The person's mark that they are done with a session (live-sessions) | Reused |
| `Tableau figé` | `StaleBoard` | A `FactoryBoard` whose last scan is more than 60 seconds old: no session of its project has the mod running | New |

## Functional Requirements

### Source

- **FR-01** — The application reads every board file the mod exports in `~/.claude/factory-board` (one per project root, the folder overridable by configuration), so that a project shows up without any setup beyond the mod.
- **FR-02** — A `FactoryBoard` belongs to the `Workspace` of its root by the same rules as a session (session-ingestion BR-02, BR-03, BR-10): a worktree's board belongs to its repository's workspace, so that a workspace can hold several boards, one per root, each titled by its branch and its path.
- **FR-03** — A `FactoryBoard` whose root matches no known `Workspace` (no refresh has seen it yet) is still shown on the factory page, named after its root's last folder, without a workspace link.
- **FR-04** — A board file of an unknown export version is not drawn; a visible note names the file and says its version is not supported.
- **FR-05** — A board the mod exported with an error shows that error in place of its features.
- **FR-06** — When the boards folder is missing or holds no board, the factory page says there is no factory board and names the folder it reads.

### Pages

- **FR-07** — A factory page, linked from the navigation without a count, lists every `FactoryBoard` grouped by `Workspace`: workspaces with a live `FactoryRun` first, then by most recent scan; a long-`StaleBoard` is never hidden.
- **FR-08** — A workspace's page shows a factory section with that workspace's boards, drawn as on the factory page without the live runs of FR-12, since the live page already shows the running sessions.
- **FR-09** — On the workspaces page, a workspace that has a board carries a factory badge with its number of features `En cours` and `À valider`, and a mark while one of its boards has a live `FactoryRun`.

### Board

- **FR-10** — Each board is headed by its branch line: the branch, its base branch, its number of commits ahead of the base branch and its number of uncommitted files.
- **FR-11** — Each board shows how long ago it was scanned; a `StaleBoard` carries a banner saying it is frozen at its last scan, and its `FactoryRun`s still `en cours` or `attend une réponse` are marked as their state at the last scan.
- **FR-12** — Each board lists its live `FactoryRun`s, one line each: its status, the feature (`nouvelle feature` without one), its step, the status's duration and its session; a click unfolds the feature it works on.
- **FR-13** — The features are grouped by `FactoryFeatureState`, one card each with its slug, its state, an autopilot mark while an autopilot works on it, one segment per stage of its plan (done, the one at hand, later) and its title when it differs from the slug.
- **FR-14** — The person filters the features by state, the filters adding up, all features by default; the `Finalisée` features are folded on one line naming them and unfold on demand.
- **FR-15** — A card unfolds into its timeline: one row per `TimelineStep` with its title, its detail and its marker; under each row its latest `FactoryRun` (date, duration, session, and its status unless done), the earlier ones folded behind a count.
- **FR-16** — A feature whose plan is on its way (a live plan writing session) says so in place of the plan, as the mod exports it.

### Prompts and links

- **FR-17** — Each `NextPrompt` of a feature (the next step, the chained stages, the autopilot) is a button that copies its prompt to the clipboard and confirms the copy, so that the person pastes it in the session of their choice.
- **FR-18** — Two switches, `avec revue` and `test navigateur`, add the mod's exported markers to the end of the stage prompts and of the autopilot prompts respectively when copied.
- **FR-19** — A `FactoryRun` links to its stored session page when the history holds the session; otherwise it has no link.

### Updates

- **FR-20** — The boards update by themselves without a reload, and a change of a board file is visible within 2 seconds of its writing; the freshness of the content itself is the mod's (FR-11).
- **FR-21** — A board file that cannot be parsed (being rewritten) keeps the board last read, with no error shown, and is read again at the next change.
- **FR-22** — A board file that disappears removes its board.
- **FR-23** — The state filters, the unfolded card and the two switches of FR-18 are kept by the person's browser, and survive a reload; the switches also set the prompt the live page copies for a job's next step (live-sessions FR-38), so that the person sets them once.

### Phases and sessions

- **FR-24** — Each `FactoryRun` shows its `Phase` when the export carries one, and its status otherwise (an older export or an older run), so that the person reads what the session waits for, not only that it waits.
- **FR-25** — A session `attend la validation du commit` shows the commit message it proposed, so that the person knows what they are asked to approve before opening the session.
- **FR-26** — A session `job done` shows its `Récap`: the recap line, else the subjects of its commits when the job wrote no recap line.
- **FR-27** — Each board is headed by its `Activité`: the `Phase`, the feature and step, since when, and the commit message or the `Récap` it carries; `au repos` when the project has none, or when its session is `Clôturée`.
- **FR-28** — A board draws no list of its `FactorySession`s and offers no `Clôturer`: they serve only to match a live tile (FR-31) and to name the `Activité`'s plan (FR-30).

### Step labels and plan names

- **FR-29** — A `FactoryRun`'s step reads `Spec`, `Plan`, `Revue du plan` (a run of the `review` command on the `plan` step), `Revue finale`, or for a stage the title its own plan (the run's plan folder) gives that stage when the export carries that plan's stages (it is the feature's followed plan), else `Stage N`, so that a run is never labelled with a stage of another plan of its feature.
- **FR-30** — Every live run line, timeline run line, autopilot mark and the `Activité` names the run's plan: the last folder of its plan folder without its timestamp (`add-session-phases`), the `Activité` taking the plan of its session's run; a run that names no plan folder shows no plan name, so that two `Revue finale` of the same feature are told apart.

### Live page

- **FR-31** — On the live page, the tile of a `LiveSession` found by its session among a board's live runs or `FactorySession`s carries a factory band, drawn as live-sessions FR-33 and FR-35 say: its feature (`nouvelle feature` without one), its step (FR-29), its plan name (FR-30) and the segments of its feature's stages (FR-13), its `Phase` moving to the tile's status pill (live-sessions FR-32); the live run wins over the `FactorySession` when both name it, the main loop over a subagent's run, then the latest change, and a run the mod records for a free request off the workflow gives no band (live-sessions FR-34), so that the person reads which factory job a session does without opening the factory page.

## Business Rules

- **BR-01** — The application only reads the boards folder: it never writes, moves or deletes a board file, even a long-stale one.
- **BR-02** — The board is drawn as exported: a state, a marker, a run's status or a prompt is never derived again or corrected by the application, a `StaleBoard`'s included (FR-11 marks it, never changes it).
- **BR-03** — A `FactoryRun` exists only for sessions started with a `/factory:` command: a session typed without one never appears on a board, only on the live page.
- **BR-04** — `Clôturer` is the person's mark, made on the live page and kept by their browser (live-sessions BR-10): it hides a session from the `Activité` of FR-27, and never changes a `Phase` or anything else the mod exported (BR-02).

## UX Flow

- Navigation → `Factory`: the boards grouped by workspace, live ones first.
- Each board: branch line and scan age (frozen banner when stale) → its `Activité` → live runs → state filters → cards by state, the finalized ones folded.
- A card unfolds into its timeline; the step at hand shows its prompt buttons and the two switches; a click copies the prompt.
- A run's session opens the stored session page.
- Workspaces page: factory badge on a workspace → its page → factory section with its boards.
- Live page: a factory session's tile reads e.g. `Job done` in its pill and `factory-board › Revue finale · add-session-phases` with its stage segments in its band, under its title.

## Decisions taken autonomously

- Feature slug → `factory-board`, existing (the factory line on the live tile is a factory-board requirement, like the workspace section; the live-sessions spec is unchanged).
- Where does a stage title come from when the run's plan is not the feature's followed plan? → `Stage N` (the export carries the stages of the followed plan only and the application reads no `plan.md`; so most past stage runs, e.g. session 81c1825f on `add-status-board`, read `Stage N` with their plan name beside it).
- Do `Spec`, `Plan`, `Revue du plan` and `Revue finale` depend on the run's plan? → No, fixed labels (they name no stage of a plan).
- Do the timeline's run lines and the autopilot mark follow FR-29 and FR-30 too? → Yes (they are run lines; the timeline rows' own titles stay as exported, BR-02).
- Plan name of a run without a plan folder (`write-spec`, a `write-plan` whose folder does not exist yet)? → None shown (nothing to name).
- Plan name of the `Activité`, which the export gives without a folder? → The plan of its session's run among the live runs and `FactorySession`s, none when not found (same session, same run).
- Which run gives the live tile its factory line when the session is both a live run and a `FactorySession`? → The live run (the fresher one).
- A `StaleBoard`'s sessions on the live page? → Still matched, the line showing the phase at the last scan (BR-02; the tile's own state stays live-sessions').
- A board of an unsupported version (FR-04)? → Not used for the live tiles (it is not drawn anywhere).
- Does the folded `Idle` group of the live page carry the factory line? → No, the column tiles only (the group's lines are kept compact).
- Is the live tile's factory line a link to the factory page? → No (not asked; the tile's own links stay live-sessions').
- Does a `Clôturée` session's tile lose its factory line? → No rule added: the tile follows live-sessions, the line follows the tile.
- Feature slug for dropping the session list (2026-10-20) → `factory-board`, existing (the list is its FR-28; the live page is unchanged).
- Which list goes? → The `FactorySession` list of FR-28 only; the live runs of FR-12 stay (they are the runs at work, with their feature and step, and unfold the feature's card).
- FR-28 removed or revised? → Revised in place under the same id, stating the board draws no session list (ids are never renumbered; FR-29 to FR-31 are cited by plans).
- Does the factory page keep a `Clôturer`? → No: it went with the list; the person closes a session on the live page (live-sessions FR-17).
- Does the `Activité` still honour a `Clôturée` mark? → Yes, the mark made on the live page (FR-27, BR-04).
- Does the board still read the exported `FactorySession`s? → Yes, for the live tile's factory line (FR-31) and the `Activité`'s plan name (FR-30); only their drawing goes.
- A session `job done` or `interrompue` whose process ended is no longer listed anywhere live? → Accepted (the request: the live page shows the sessions; the stored history keeps it, and the `Activité` still names the latest one).
- Where do FR-25's commit message and FR-26's `Récap` show now? → In the `Activité` and on the live run lines, unchanged (they never belonged to the list alone).
- The workspace page's factory section (FR-08)? → Loses the list too: it is drawn as on the factory page.
- live-sessions BR-10 and its `Clôturée` glossary entry still say the mark is shared with the factory sessions → Left for the plan (write-spec called mode): this commit holds the factory-board spec only.
- Feature slug for the factory band on the live tile (2026-10-20) → `factory-board`, existing; revised from the plan `live-sessions` `add-factory-phases` (write-spec called mode, autonomous), shipped in that plan's commit.
- FR-31 revised or replaced? → Revised in place under the same id: the line becomes the band, the phase moves to the pill (live-sessions FR-32); ids are never renumbered.
- Does the match rule change? → No: the live run before the `FactorySession`, the main loop before a subagent's run, then the latest change, over every board, a stale one included (the rule the live tiles already used).
- The mod also records free requests as runs (`command` and `step` `off-workflow`), which BR-03 does not foresee → such a run is no factory job: when it is the session's match, the tile reads `Hors workflow` (live-sessions FR-34); BR-03 is left as is (append-only), this decision records the reading.
- Are the `avec revue` and `test navigateur` switches shared with the live page? → Yes, kept by the browser (FR-23) (live-sessions FR-38 copies the next step's prompt "as the factory page's switches set them"; switches local to the page could not be read there).
- The non-goal "Changing the live page beyond the factory line of FR-31" → revised: the live page draws the factory data (live-sessions FR-32 to FR-40); this feature keeps the match only.
- The live runs on the workspace page's factory section (2026-10-20)? → Dropped, by the person's request (the live page shows the running sessions); the `Activité` (FR-27) stays, and the factory page keeps its live runs (FR-12).
