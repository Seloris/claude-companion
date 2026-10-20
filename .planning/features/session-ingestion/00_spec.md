# Session ingestion (ingestion des sessions) — PRD

> **Slug**: `session-ingestion`
> **Status**: Approved
> **Last updated**: 2026-10-20

## TL;DR

The person runs Claude Code in many workspaces on one PC and has no overview of what was done where. This feature reads the Claude Code session logs, stores each session once in the application's database, keeps it up to date incrementally, and shows a first recap: the workspaces, then the sessions of each workspace. It keeps the history up to date in the background while the application runs, and warns the person before Claude Code deletes a log the application has not read yet. From a stored session, the person reopens it: in the Claude desktop app when it has a link there, else with a resume command copied for a terminal.

## Problem

Claude Code writes one log file per session under `~/.claude/projects`, in folders named after an encoded path, mixed with worktrees, case variants of the same folder and the desktop app's scratch workspaces. Answering "what did I do on this project last week, in how many sessions, with how many tokens" means opening raw JSONL files by hand. Claude Code also deletes old logs (after 30 days by default), so that history is lost for good.

## Non-goals

- Conversations of claude.ai and of the Claude desktop chat: only Claude Code sessions.
- A cost in dollars: tokens only; an estimated cost needs a price table and is a later feature.
- The full conversation (assistant replies, tool calls and their results): only the person's prompts are kept.
- Live updates while a session runs: the data changes on a refresh only; only whether a session is live, which decides its `ResumeCommand` (BR-15), follows the live state.
- Resuming a session from the application itself: it opens the desktop app's link or copies the command, the person runs it.
- Search, filters, charts and cross-workspace statistics: the dashboard is a later feature.
- Changing or deleting sessions, or anything in the logs folder.
- Changing Claude Code's log retention: the application reads the setting, the person changes it in Claude Code.
- Refreshing while the application is closed: no background service outside the application.
- Several users or a sign-in: the application is local and single-user.

## Domain Glossary

Canonical entity names introduced or reused. Names only: no properties, relationships or persistence.

| Business term | Identifier | Business meaning | Status |
|---|---|---|---|
| `Workspace` | `Workspace` | A real folder in which Claude Code sessions ran; a repository's worktrees and case variants of its path belong to it | New |
| `Groupe Scratch` | `ScratchGroup` | All the temporary scratch workspaces of the Claude desktop app, gathered as one workspace | New |
| `Session` | `Session` | One Claude Code conversation, from one log file, with its subagents | New |
| `Sous-agent` | `Subagent` | A helper agent a session launched; its activity counts toward its session | New |
| `Prompt` | `Prompt` | A message or a slash command the person typed in a session | New |
| `Actualisation` | `Refresh` | One pass that reads the new and changed log files into the database | New |
| `Actualisation périodique` | `PeriodicRefresh` | A `Refresh` the application starts by itself at the interval the person chose | New |
| `Durée de conservation` | `LogRetention` | The number of days Claude Code keeps a log file after its last change before deleting it | New |
| `Session en direct` | `LiveSession` | A `Session` whose Claude Code process is alive on this machine (live-sessions) | Reused |
| `Lien bureau` | `DesktopLink` | A link that opens a `Session` in the Claude desktop app | New |
| `Commande de reprise` | `ResumeCommand` | The command that moves to a `Session`'s folder and runs `claude --resume {session id}`, reopening it in a terminal, written so that the usual terminals of the machine (PowerShell, cmd, bash) all take it | New |

## Functional Requirements

- **FR-01** — A refresh runs automatically when the application starts and then as a `PeriodicRefresh` (FR-13), and the person can start one from the recap at any time.
- **FR-02** — A refresh reads only the log files that are new or changed since the previous refresh, so that it stays fast as the history grows.
- **FR-03** — A refresh ends with a report shown to the person: sessions added, sessions updated, sessions archived, unreadable lines skipped, and its duration.
- **FR-04** — Each session records its title, start and end time, duration, the models used, its git branch, its origin (CLI, desktop app, IDE…), its number of prompts, its tokens per model (input, output, cache read, cache write) and its number of subagents.
- **FR-05** — A session's tokens include those of its subagents, so that its totals reflect what it really consumed.
- **FR-06** — A session keeps its prompts in order: the messages the person typed and the slash commands with their arguments, without tool results, hook output, system reminders or the expanded text of skills.
- **FR-07** — A session's title is the title Claude Code gave it (renamed or generated), else its first prompt shortened, else its identifier.
- **FR-08** — The workspaces page lists the workspaces from the most recent activity to the oldest, each with its name, its path, its number of sessions, its last activity and its total tokens.
- **FR-09** — The Scratch group is hidden by default and shown with a switch on the workspaces page; the totals include it only while it is shown.
- **FR-10** — A workspace's page lists its sessions from the most recent to the oldest, each with its title, date, duration, models, branch, tokens and whether it is archived; opening a session shows its prompts.
- **FR-11** — While a refresh runs, the refresh control shows it is in progress and the data already stored stays browsable.
- **FR-12** — When the logs folder is missing or holds no session, the recap says so and names the folder it reads.
- **FR-13** — The person chooses the interval of the `PeriodicRefresh` in the refresh control, among off, 5, 10, 30 and 60 minutes, 10 by default; the choice applies at once and survives a restart of the application.
- **FR-14** — The workspaces page shows the `LogRetention` in force, the date of the oldest log file and the number of sessions whose log has disappeared and that only the database still holds, so that the person sees what the application already saves.
- **FR-15** — The workspaces page shows a warning banner when at least one log file holds changes no refresh has read yet and Claude Code will delete it in less than 7 days, with the number of such files and the nearest deletion date, so that the person refreshes before losing them.
- **FR-16** — A session that comes from the Claude desktop app (its origin, FR-04) and has a `DesktopLink` offers to open it in the desktop app, from its session page and from its row in its workspace's session list.
- **FR-17** — A session with no `DesktopLink` offers, from the same two places, a button that copies its `ResumeCommand` to the clipboard, so that the person resumes it in a terminal with one paste; copying writes nothing, the person runs the command.
- **FR-18** — Copying the `ResumeCommand` is confirmed in a line; when the browser cannot write to the clipboard, the command is shown for the person to copy by hand.

## Business Rules

- **BR-01** — The application only reads the logs folder: it never writes, moves or deletes anything there.
- **BR-02** — A session's workspace comes from the working directory recorded in its log, not from the log folder's name; paths that differ only by letter case are the same workspace.
- **BR-03** — A session run in a worktree of a repository (`.claude/worktrees/…`) belongs to that repository's workspace, and keeps its own branch.
- **BR-04** — Every session run in a scratch workspace of the Claude desktop app belongs to the Scratch group.
- **BR-05** — A session whose log file has disappeared stays in the database, marked archived, and is never deleted by a refresh; it is no longer archived if its file comes back.
- **BR-06** — Only one refresh runs at a time: a refresh asked for while one runs is ignored.
- **BR-07** — An unreadable line is skipped and counted, never fails its file; a session still in progress is completed by a later refresh.
- **BR-08** — A workspace is named after its last folder; two workspaces with the same name stay distinct and are told apart by their path.
- **BR-09** — A session whose working directory changes along the way belongs, whole, to the workspace of its first working directory, so that no session is counted twice.
- **BR-10** — A session started in a subfolder of a git repository belongs to that repository's workspace; a folder outside any repository is its own workspace.
- **BR-11** — A refresh that does not find the logs folder archives no session, so that a misplaced or missing folder never marks the whole history as archived.
- **BR-12** — A `PeriodicRefresh` is an ordinary refresh: it reads only the new and changed files, it is skipped when another refresh runs (BR-06), and its report replaces the previous one.
- **BR-13** — The `LogRetention` comes from Claude Code's settings, which the application only reads; when the setting is missing, unreadable or invalid, it is 30 days (Claude Code's default) and the page says the default applies.
- **BR-14** — A log file's deletion date is its last change plus the `LogRetention`: the application estimates it, it does not know when Claude Code actually cleans up.
- **BR-15** — The `ResumeCommand` is never offered for a `LiveSession` (its Claude Code process is alive on this machine, whatever its live state), nor while the live state cannot be read: a second Claude Code process on the same session would write to the same log. A session that becomes live while its page is open loses the button as soon as the application sees it live.
- **BR-16** — The folder of the `ResumeCommand` is the folder the session started in (its first working directory, BR-09), not its workspace's path: Claude Code finds a session only from the folder it ran in, which differs from the workspace for a worktree (BR-03), a subfolder (BR-10) or a case variant (BR-02).
- **BR-17** — An archived session (BR-05) offers no `ResumeCommand`: its log is gone, Claude Code has nothing to resume.
- **BR-18** — A session offers its `DesktopLink` or its `ResumeCommand`, never both: the link wins whenever it exists; a session with neither (live without a link, archived without a link) offers no way to reopen it.
- **BR-19** — A session's `DesktopLink` comes from Claude Code's live state, which names the desktop app's session behind a running desktop-app session: the application keeps it from the first `Refresh` that sees it there, and the session keeps it afterwards, its process ended or its log archived; a desktop-app session no refresh saw in the live state has no `DesktopLink` once it is no longer live, and offers its `ResumeCommand` instead.
- **BR-20** — A session whose folder a terminal cannot take literally (a character a terminal would interpret even inside quotes) offers no `ResumeCommand`, so that a paste never runs anything but the resume.

## UX Flow

- The person opens the application: the workspaces page shows what is stored, while the start-up refresh runs.
- The refresh ends: the page updates and shows the report.
- The person clicks a workspace: its sessions, most recent first.
- The person opens a session: its details and its prompts, in order.
- From the workspaces page, the person starts a refresh, or shows the Scratch group with the switch.
- In the refresh control, the person picks the interval of the periodic refresh; the history then stays up to date while the application runs.
- Under the refresh control, a discreet line gives the retention in force, the oldest log and the sessions only the database holds; when a log not read yet is about to be deleted, a banner replaces it until a refresh reads the file.
- On a session's page or its row, the person opens a desktop-app session in the desktop app; for another session that is not live, they copy its resume command, see it confirmed, and paste it into a terminal.

## Decisions taken autonomously

- Feature slug → `session-ingestion`, existing (the session page and the workspace's session list belong to this feature).
- Where are the link and the copy button? → On the session page and on each row of the workspace's session list (FR-16, FR-17) (the list is where the person picks the session to reopen).
- Which folder does the command `cd` into? → The folder the session started in, not the workspace's path (BR-16) (refines the person's "workspace path": Claude Code files the log of a worktree or subfolder session under that folder, so `--resume` from the workspace's path would not find it; both are the same in the ordinary case).
- Live state unreadable? → No `ResumeCommand` (BR-15) (the application cannot show the session is not live, and a wrong guess makes two processes write one log).
- Archived session? → No `ResumeCommand` (BR-17) (its log is gone).
- Desktop session with a link, not live? → The link only (BR-18) (the person's "otherwise" means one or the other).
- Clipboard refused by the browser? → The command is shown to copy by hand (FR-18) (the person is never left without it).
- A session whose folder no longer exists (a deleted scratch workspace)? → The command is offered all the same (Claude Code says so when it runs; the application does not check folders).
