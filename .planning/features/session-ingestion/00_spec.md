# Session ingestion (ingestion des sessions) — PRD

> **Slug**: `session-ingestion`
> **Status**: Approved
> **Last updated**: 2026-10-19

## TL;DR

The person runs Claude Code in many workspaces on one PC and has no overview of what was done where. This feature reads the Claude Code session logs, stores each session once in the application's database, keeps it up to date incrementally, and shows a first recap: the workspaces, then the sessions of each workspace.

## Problem

Claude Code writes one log file per session under `~/.claude/projects`, in folders named after an encoded path, mixed with worktrees, case variants of the same folder and the desktop app's scratch workspaces. Answering "what did I do on this project last week, in how many sessions, with how many tokens" means opening raw JSONL files by hand. Claude Code also deletes old logs (after 30 days by default), so that history is lost for good.

## Non-goals

- Conversations of claude.ai and of the Claude desktop chat: only Claude Code sessions.
- A cost in dollars: tokens only; an estimated cost needs a price table and is a later feature.
- The full conversation (assistant replies, tool calls and their results): only the person's prompts are kept.
- Live updates while a session runs: the data changes on a refresh only.
- Search, filters, charts and cross-workspace statistics: the dashboard is a later feature.
- Changing or deleting sessions, or anything in the logs folder.
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

## Functional Requirements

- **FR-01** — A refresh runs automatically when the application starts, and the person can start one from the recap at any time.
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

## UX Flow

- The person opens the application: the workspaces page shows what is stored, while the start-up refresh runs.
- The refresh ends: the page updates and shows the report.
- The person clicks a workspace: its sessions, most recent first.
- The person opens a session: its details and its prompts, in order.
- From the workspaces page, the person starts a refresh, or shows the Scratch group with the switch.
