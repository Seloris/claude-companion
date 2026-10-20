# Live sessions (sessions en direct) — PRD

> **Slug**: `live-sessions`
> **Tags**: #sessions
> **Status**: Approved
> **Last updated**: 2026-10-20

## TL;DR

The person runs several Claude Code sessions at once, in several workspaces, and only sees what each one does by switching to it. This feature adds a live page: every session running on this machine, as tiles in three columns by state (waiting for an answer, running, finished), each tile naming its workspace, what the session is doing right now (tool, skill, agent), its last prompt and, once finished, Claude's last reply. The page updates by itself; a session whose process ends leaves it and stays in the stored history. On request, the browser also notifies the person when a session asks a question and, if they choose, when a turn ends.

## Problem

With five or six sessions open across the desktop app, a terminal and worktrees, the person loses track: which one is still working, which one stopped on a question an hour ago, which one finished and waits for the next prompt. Finding out means clicking through every session. The recap pages of the application show the stored history, which changes on a refresh only; they say nothing about the sessions in progress.

A first live page grouped the sessions by workspace: the person still had to scan every workspace to find what needs them, and a session that had just finished its turn looked the same as one idle for hours, folded away with it.

The board and the counts in the tab's title still have to be looked at: while the person works in another window, a session can wait on a question for an hour before they glance back.

## Non-goals

- Acting on a session: sending it a prompt, answering its question, stopping it. The page observes only; opening a desktop-app session in the desktop app (FR-31) is its one shortcut.
- Opening a session of the CLI or of an IDE from its tile: the application cannot bring a terminal to the front, and a resume command would start a second process (BR-18).
- Tokens and costs of a running session: tokens come from the stored history, after the fact.
- Sessions of other machines, cloud sessions, conversations of claude.ai and of the Claude desktop chat.
- The relation between a session and the sessions it started: each live session stands on its own, under its workspace.
- Enriching the stored history from the live view: the history keeps coming from the logs through a refresh.
- Sharing the `Clôturée` marks across browsers or devices: they belong to the browser the person closed the session in.
- Showing a session whose process ended as finished: it leaves the page at once (BR-01); the stored history holds it.
- Notifications while no page of the application is open: the browser notifies only through an open page.
- Notifications for other changes (a session starting to run, a change of `CurrentActivity`, a session leaving the page): only a question and, on request, the end of a turn need the person.
- Sharing the notification settings across browsers or devices: like the `Clôturée` marks, they belong to the browser the person set them in.

## Domain Glossary

Canonical entity names introduced or reused. Names only: no properties, relationships or persistence.

| Business term | Identifier | Business meaning | Status |
|---|---|---|---|
| `Workspace` | `Workspace` | A real folder in which Claude Code sessions ran; a repository's worktrees and case variants of its path belong to it | Reused |
| `Groupe Scratch` | `ScratchGroup` | All the temporary scratch workspaces of the Claude desktop app, gathered as one workspace | Reused |
| `Session` | `Session` | One Claude Code conversation, from one log file, with its subagents | Reused |
| `Sous-agent` | `Subagent` | A helper agent a session launched; it has a type and runs on a model | Reused |
| `Prompt` | `Prompt` | A message or a slash command the person typed in a session | Reused |
| `Actualisation` | `Refresh` | One pass that reads the new and changed log files into the database | Reused |
| `Session en direct` | `LiveSession` | A `Session` whose Claude Code process is alive on this machine | New |
| `État` | `LiveStatus` | What a `LiveSession` is doing from the person's point of view: `En cours` (`Running`), `Question posée` (`AwaitingAnswer`) or `Au repos` (`Idle`) | New |
| `Activité courante` | `CurrentActivity` | What a `Running` session is doing right now: a tool, a skill, an agent, or thinking | New |
| `Prompt en file d'attente` | `QueuedPrompt` | A `Prompt` the person sent while the session was busy, not yet taken up | New |
| `Tour` | `Turn` | One `Prompt`, or a message that restarts Claude without the person (a background task's notification, a message from another session), and the work Claude Code does on it, until the session is `Idle` again | New |
| `Dernière réponse` | `LastReply` | The last text Claude wrote to the person in the latest `Turn` of a session | New |
| `Terminée` | `Finished` | An `Idle` `LiveSession` whose latest `Turn` ended and that the person has not `Clôturée` yet | New |
| `Clôturée` | `Closed` | The person's mark that they are done with a `Finished` session's latest `Turn`, shared with the factory sessions (factory-board) | New |
| `Lien bureau` | `DesktopLink` | A link that opens a `Session` in the Claude desktop app | Reused |
| `Commande de reprise` | `ResumeCommand` | The command that reopens a `Session` in a terminal (session-ingestion) | Reused |
| `Notification` | `LiveNotification` | A browser notification about one `LiveSession`, of one of two kinds: `Question posée` (it became `AwaitingAnswer`) or `Tour terminé` (it became `Finished`) | New |

## Functional Requirements

### The live page

- **FR-01** — A live page lists every `LiveSession` of this machine as tiles in three columns, `Question posée` (`AwaitingAnswer`), `En cours` (`Running`) and `Terminées` (`Finished`), each with its count, and the other `Idle` sessions below them, so that what needs the person is read by state, not workspace by workspace.
- **FR-02** — Each `LiveSession` shows its `Workspace` (name and a colour that stays the same for that workspace), its title, its `LiveStatus` and since when, its start time and total duration, its `CurrentActivity`, its last prompt, its `QueuedPrompt`s in order, its git branch and its origin (CLI, desktop app, IDE…).
- **FR-03** — A `Running` session names its activity: the tool being called, the skill being run, or the agent launched with its type and description; a session thinking between two tool calls shows that.
- **FR-04** — A `Running` session lists its running subagents, each with its type, its description, its current tool and since when it runs, so that a long review or exploration is visible as such.
- **FR-05** — An `AwaitingAnswer` session shows the question Claude Code asked, shortened, so that the person knows what to answer before opening the session.
- **FR-06** — Long texts (last prompt, queued prompts, question, agent description) are shortened on the page, so that one screen holds every session.
- **FR-07** — The `Idle` sessions that are not `Finished` are folded in one group for the whole page, each reduced to its title, its `Workspace`, since when it is idle and its `DesktopLink` when it has one (FR-31), and unfold on demand.
- **FR-08** — The sessions of the `ScratchGroup` are always shown, their `Workspace` named as the group, without the switch of the workspaces page: a running session is never noise.
- **FR-09** — When no session is live, the page says so.
- **FR-10** — Each `LiveSession` links to its stored session page when the history already holds it; a session not yet refreshed has no link.

### Freshness

- **FR-11** — The page updates by itself, without a reload, and a change of `LiveStatus` or of `CurrentActivity` is visible within 5 seconds.
- **FR-12** — When the live state can no longer be read (folder missing or unreadable), the page says so instead of freezing on stale sessions.
- **FR-13** — When a `LiveSession` leaves the page (its process ended), a `Refresh` runs, so that its recap in the stored history is up to date without the person asking.

### Navigation

- **FR-14** — The navigation links to the live page with two counts, the `AwaitingAnswer` sessions (highlighted) and the `Running` sessions, and the browser tab's title starts with the number of `AwaitingAnswer` sessions when there is one, so that a waiting session is visible from every page and from another tab.

### The status board

- **FR-15** — Inside a column the order is stable: `Question posée` and `En cours` by the time the session entered the state, oldest first; `Terminées` most recent first; a tile keeps its place while its state does not change, so that the page does not jump at every update.
- **FR-16** — A `Finished` session shows its `LastReply`, shortened, and the duration of its latest `Turn`, so that the person knows the outcome before opening the session.
- **FR-17** — The person closes a `Finished` session with `Clôturer`, one at a time or the whole column at once; it then moves to the folded `Idle` group, and only then: a finished session never leaves the column by itself, so that no outcome goes unread.
- **FR-18** — A session whose `LiveStatus` just changed is highlighted for a few seconds (8 s), with no motion when the person's system asks for reduced motion, so that a change is noticed without staring at the page.
- **FR-19** — The person filters the page by `Workspace`: one choice per workspace with its number of sessions, all of them by default; the filter applies to the three columns and to the `Idle` group, never to the navigation counts.
- **FR-20** — An empty column says so in a line, so that "nothing waits for you" is read as such.
- **FR-21** — The page shows how long ago it was last updated.
- **FR-22** — On a phone-sized screen the three columns become three tabs with their counts, `Question posée` first.

### Notifications

- **FR-23** — Notifications are off until the person turns them on from the live page; accepting the browser's permission turns the `Question posée` notifications on at once.
- **FR-24** — When a `LiveSession` becomes `AwaitingAnswer`, a `Question posée` notification names its `Workspace`, its title and the question, shortened, so that the person knows which session waits and for what without opening the application.
- **FR-25** — The `Tour terminé` notifications have their own switch, off by default; once on, a session that becomes `Finished` gives a notification naming its `Workspace`, its title, its `LastReply` shortened and the duration of its `Turn`.
- **FR-26** — The person turns each kind of notification off and on again from the live page, without changing the browser's permission.
- **FR-27** — Notifications arrive as long as one page of the application is open in the browser, whichever page it is, so that the person does not have to keep the live page open.
- **FR-28** — Clicking a notification brings the application's tab to the front and opens the live page filtered on the session's `Workspace` (FR-19).
- **FR-29** — When the browser refuses notifications (permission denied, or no support), the live page says so and how to allow them again, instead of a switch that does nothing.
- **FR-30** — A `Question posée` notification is withdrawn once its session is no longer `AwaitingAnswer` (answered, or ended), so that only the questions still waiting remain.

### Opening a session

- **FR-31** — A `LiveSession` that comes from the Claude desktop app (its origin, FR-02) and has a `DesktopLink` offers to open it in the desktop app, from its tile and from its line in the folded `Idle` group, so that the person jumps from the board to the session.

## Business Rules

- **BR-01** — A session is live only while its Claude Code process is alive on this machine; a session whose process is gone leaves the page at once, with no "ended" status, and stays in the stored history like any other.
- **BR-02** — `Running` means Claude Code is busy: a tool, a skill, an agent or its own thinking is in progress; `AwaitingAnswer` means Claude Code asked the person a question and waits for the answer to go on; `Idle` means the turn ended and the session waits for the next prompt.
- **BR-03** — A permission request cannot be told apart from a tool that runs: a session waiting for a permission counts as `Running`.
- **BR-04** — The status Claude Code declares wins over what the log suggests: a log whose last tool call has no result while Claude Code says the session is idle (an interrupted tool) gives an `Idle` session.
- **BR-05** — A session too young to have a readable log is live all the same: its status comes from Claude Code and its `CurrentActivity` is unknown.
- **BR-06** — A `LiveSession` is titled and attached to its `Workspace` by the same rules as a stored session (session-ingestion FR-07, BR-02, BR-03, BR-04, BR-10), so that the live page and the workspaces page agree.
- **BR-07** — The live page stores nothing on the application's side: it reads the live state of Claude Code and the session logs, and never writes, moves or deletes anything there; the `Clôturée` marks are kept by the person's browser only (BR-10).
- **BR-08** — A session started by another session is a `LiveSession` like any other, under its own workspace, with no link to the session that started it.
- **BR-09** — A session is `Finished` while it is `Idle`, has had a `Turn` since its Claude Code process started (a resumed session's older turns do not count) and is not `Clôturée`, however long ago the turn ended; otherwise an `Idle` session goes to the folded group. A session too young to have a turn is never `Finished`.
- **BR-10** — A `Clôturée` mark covers the turns ended before it: a session that runs again and finishes a new turn is `Finished` again. One mark per session serves the live page and the factory sessions (factory-board BR-04): closing a session in either closes it in both. The marks live in the browser the person used, survive a reload, and are forgotten with the browser's data or a month after they were made.
- **BR-11** — The `LastReply` is the last text Claude Code wrote in the main conversation of the latest `Turn`, never a subagent's; a turn that ended without text (an interruption, tool calls only) has none, and the tile says so.
- **BR-12** — One change of a session gives one notification, however many pages of the application are open; a newer notification of the same session replaces the previous one instead of piling up.
- **BR-13** — Only a change seen while a page of the application is open notifies: sessions already `AwaitingAnswer` or `Finished` when a page opens, or when the live state can be read again (FR-12), notify nothing, so that opening the application never fires a burst of notifications.
- **BR-14** — Notifications follow the `LiveStatus` only: a session waiting for a permission counts as `Running` (BR-03) and notifies nothing.
- **BR-15** — The workspace filter (FR-19) never applies to notifications: every `LiveSession` of this machine can notify.
- **BR-16** — The notification settings are kept by the person's browser only, like the `Clôturée` marks (BR-10): they survive a reload and are forgotten with the browser's data.
- **BR-17** — Clicking a `Tour terminé` notification does not close the session: `Clôturer` stays the person's act on the page.
- **BR-18** — A `LiveSession` never offers a `ResumeCommand`, whatever its `LiveStatus` (session-ingestion BR-15): a second Claude Code process would write to the same log; a live session without a `DesktopLink` offers no way to open it.
- **BR-19** — A `Tour terminé` notification is given only for a turn that ended after the previous read of the live state: a session seen for the first time, or seen again after a read that missed it, whose turn ended earlier notifies nothing, so that an old finished turn never notifies.

## UX Flow

![The status board: Question posée, En cours, Terminées (`Terminées récemment` before FR-17's revision), and the folded idle group](./assets/live-status-board.png)

![One tile in its three states, where each element comes from, the transitions and the navigation counts](./assets/live-tile-anatomy.png)

- The person works in another tab: its title reads "(2) claude-companion", two sessions wait for an answer. In the application the navigation shows "2" highlighted and "4" running.
- The person opens the live page: on the left `Question posée`, the longest wait on top, each tile with its workspace, the question shortened and since when it waits.
- In `En cours`, each tile names its workspace, its current tool or agent and its subagents; the person reads what each session does without switching to it.
- A session finishes its turn: within 5 seconds its tile moves to `Terminées`, highlighted for a few seconds, with Claude's last reply and the turn's duration.
- The person reads the reply and clicks `Clôturer`: the tile moves to the folded idle group. Left alone, it stays in `Terminées`.
- The person picks one workspace in the filter: the three columns and the idle group show its sessions only.
- The person closes a session: it leaves the page, and a refresh updates its recap in the history.
- The person clicks a session's link: its stored page, with its prompts and activity.
- On the live page, the person turns notifications on and accepts the browser's request: `Question posée` notifications are on; `Tour terminé` stays off until they tick it.
- The person works in another window with the workspaces page open: a session asks a question, a notification names its workspace, its title and the question.
- The person clicks the notification: the application's tab comes to the front on the live page, filtered on that workspace, the waiting tile in `Question posée`.
- The person answers in the session: the notification disappears.
- On the tile of a desktop-app session, the person clicks to open it: the desktop app shows that session.

## Decisions taken autonomously

- Feature slug → `live-sessions`, existing (the notifications report changes of `LiveStatus`, which this feature owns).
- Where are the notification switches? → On the live page (it is the page about live sessions; the navigation keeps its counts only).
- Can `Question posée` be turned off without revoking the browser's permission? → Yes, its own switch (FR-26) (the person cannot be asked to dig into browser settings to mute it).
- What does a notification show? → `Workspace`, title, and the question or the `LastReply` shortened, plus the turn's duration for `Tour terminé` (the same facts as the tile, enough to decide whether to switch).
- Several pages of the application open? → One notification per change (BR-12) (one per tab would multiply them).
- Sessions already waiting when a page opens? → No notification (BR-13) (opening the application would fire a burst; the board and the tab title already show them).
- Does a permission request notify? → No (BR-14) (it counts as `Running`, BR-03; the live state cannot tell it apart).
- Does the workspace filter mute notifications? → No (BR-15) (same as the navigation counts; the filter is a view, not a subscription).
- Notify while the live page is in the foreground? → Yes, no suppression (the person asked for any open page; the page may be open but behind another window).
- Does clicking a `Tour terminé` notification close the session? → No (BR-17) (`Clôturer` stays an explicit act on the page).
- A `Question posée` notification for a question already answered? → Withdrawn (FR-30) (a stale question would send the person to a session that no longer waits).
- Browser refuses or cannot notify? → The live page says so and how to allow them again (FR-29) (a switch that silently does nothing would mislead).
- Feature slug (opening a session) → `live-sessions`, existing (the tile and the folded group belong to this feature).
- Does the folded `Idle` group offer the `DesktopLink` too? → Yes (~FR-07, FR-31) (an idle desktop session is the one the person most often reopens).
- Does clicking a notification open the session in the desktop app? → No, FR-28 is unchanged (the notification brings the person to the board; the link stays on the tile).
- Does opening the desktop app's link break "the page observes only"? → No, the non-goal is clarified (it writes nothing and sends nothing to the session).
