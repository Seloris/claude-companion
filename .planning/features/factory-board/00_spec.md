# Factory board (tableau factory) — PRD

> **Slug**: `factory-board`
> **Tags**: #factory
> **Status**: Approved
> **Last updated**: 2026-10-20

## TL;DR

The projects built with the factory workflow have a factory board inside Claude Code (the factory-board mod's pane): their features, the plan timeline of each, and the factory sessions at work. It is visible only inside a Claude Code session of that one project. This feature shows every project's board in the application, with each project's workspace, and draws it as the pane does. The board is read from the export the mod writes, and the application only draws it.

## Problem

The person drives several factory projects at once, often through autopilots and side sessions. To know which feature is at which stage, which session is working on it and what the next command is, they must open a Claude Code session in each project and open its pane. Nothing gives the cross-project view, and nothing shows a project's board while no session of it is open.

## Non-goals

- Acting on a project: the application never writes a plan, a spec, `factory.yaml` or the board, never fills a Claude Code prompt box and never starts a session; it copies prompts to the clipboard only.
- Recomputing the board: the states, the markers, the steps' runs, the live runs and the prompts are the mod's; the application draws them as exported, without correcting them.
- The pane's controls that write or that the export does not carry: the plan picker (only the default plan's timeline is exported), `Nouvelle feature`, `Squasher`, the models screen, `Marquer comme fait`, the rescan.
- Showing the factory step on the live page's tiles: a later evolution of `live-sessions`.
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
- **FR-08** — A workspace's page shows a factory section with that workspace's boards, drawn as on the factory page.
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
- **FR-23** — The state filters and the unfolded card are kept by the person's browser, and survive a reload.

## Business Rules

- **BR-01** — The application only reads the boards folder: it never writes, moves or deletes a board file, even a long-stale one.
- **BR-02** — The board is drawn as exported: a state, a marker, a run's status or a prompt is never derived again or corrected by the application, a `StaleBoard`'s included (FR-11 marks it, never changes it).
- **BR-03** — A `FactoryRun` exists only for sessions started with a `/factory:` command: a session typed without one never appears on a board, only on the live page.

## UX Flow

- Navigation → `Factory`: the boards grouped by workspace, live ones first.
- Each board: branch line and scan age (frozen banner when stale) → live runs → state filters → cards by state, the finalized ones folded.
- A card unfolds into its timeline; the step at hand shows its prompt buttons and the two switches; a click copies the prompt.
- A run's session opens the stored session page.
- Workspaces page: factory badge on a workspace → its page → factory section with its boards.
