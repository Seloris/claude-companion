# Live sessions (sessions en direct) — PRD

> **Slug**: `live-sessions`
> **Tags**: #sessions
> **Status**: Approved
> **Last updated**: 2026-10-19

## TL;DR

The person runs several Claude Code sessions at once, in several workspaces, and only sees what each one does by switching to it. This feature adds a live page: every session running on this machine, grouped by workspace, with its status (running, waiting for an answer, idle), what it is doing right now (tool, skill, agent), its last prompt and the prompts queued behind it. The page updates by itself; a session whose process ends leaves it and stays in the stored history.

## Problem

With five or six sessions open across the desktop app, a terminal and worktrees, the person loses track: which one is still working, which one stopped on a question an hour ago, which one finished and waits for the next prompt. Finding out means clicking through every session. The recap pages of the application show the stored history, which changes on a refresh only; they say nothing about the sessions in progress.

## Non-goals

- Acting on a session: sending it a prompt, answering its question, stopping it. The page observes only.
- Tokens and costs of a running session: tokens come from the stored history, after the fact.
- System or browser notifications when a session starts waiting: the person watches the page.
- Sessions of other machines, cloud sessions, conversations of claude.ai and of the Claude desktop chat.
- The relation between a session and the sessions it started: each live session stands on its own, under its workspace.
- Enriching the stored history from the live view: the history keeps coming from the logs through a refresh.

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

## Functional Requirements

### The live page

- **FR-01** — A live page lists every `LiveSession` of this machine, grouped by `Workspace`: the workspaces holding an `AwaitingAnswer` session first, then by most recent activity; inside a workspace the same order, `Idle` sessions last.
- **FR-02** — Each `LiveSession` shows its title, its `LiveStatus` and since when, its start time and total duration, its `CurrentActivity`, its last prompt, its `QueuedPrompt`s in order, its git branch and its origin (CLI, desktop app, IDE…).
- **FR-03** — A `Running` session names its activity: the tool being called, the skill being run, or the agent launched with its type and description; a session thinking between two tool calls shows that.
- **FR-04** — A `Running` session lists its running subagents, each with its type, its description, its current tool and since when it runs, so that a long review or exploration is visible as such.
- **FR-05** — An `AwaitingAnswer` session shows the question Claude Code asked, shortened, so that the person knows what to answer before opening the session.
- **FR-06** — Long texts (last prompt, queued prompts, question, agent description) are shortened on the page, so that one screen holds every session.
- **FR-07** — `Idle` sessions are folded per workspace, each reduced to its title and since when it is idle, and unfold on demand.
- **FR-08** — The sessions of the `ScratchGroup` are always shown, under the group, without the switch of the workspaces page: a running session is never noise.
- **FR-09** — When no session is live, the page says so.
- **FR-10** — Each `LiveSession` links to its stored session page when the history already holds it; a session not yet refreshed has no link.

### Freshness

- **FR-11** — The page updates by itself, without a reload, and a change of `LiveStatus` or of `CurrentActivity` is visible within 5 seconds.
- **FR-12** — When the live state can no longer be read (folder missing or unreadable), the page says so instead of freezing on stale sessions.
- **FR-13** — When a `LiveSession` leaves the page (its process ended), a `Refresh` runs, so that its recap in the stored history is up to date without the person asking.

### Navigation

- **FR-14** — The navigation links to the live page with a badge counting the `Running` and `AwaitingAnswer` sessions, so that a waiting session is visible from every page.

## Business Rules

- **BR-01** — A session is live only while its Claude Code process is alive on this machine; a session whose process is gone leaves the page at once, with no "ended" status, and stays in the stored history like any other.
- **BR-02** — `Running` means Claude Code is busy: a tool, a skill, an agent or its own thinking is in progress; `AwaitingAnswer` means Claude Code asked the person a question and waits for the answer to go on; `Idle` means the turn ended and the session waits for the next prompt.
- **BR-03** — A permission request cannot be told apart from a tool that runs: a session waiting for a permission counts as `Running`.
- **BR-04** — The status Claude Code declares wins over what the log suggests: a log whose last tool call has no result while Claude Code says the session is idle (an interrupted tool) gives an `Idle` session.
- **BR-05** — A session too young to have a readable log is live all the same: its status comes from Claude Code and its `CurrentActivity` is unknown.
- **BR-06** — A `LiveSession` is titled and attached to its `Workspace` by the same rules as a stored session (session-ingestion FR-07, BR-02, BR-03, BR-04, BR-10), so that the live page and the workspaces page agree.
- **BR-07** — The live page stores nothing: it reads the live state of Claude Code and the session logs, and never writes, moves or deletes anything there.
- **BR-08** — A session started by another session is a `LiveSession` like any other, under its own workspace, with no link to the session that started it.

## UX Flow

- The person opens the application: the navigation shows the live badge, say "3", meaning three sessions are running or waiting.
- The person opens the live page: the workspaces in order, the one with a session on a question first; that session shows the question, shortened.
- A running session shows its current tool or agent and its subagents; the person reads what it does without switching to it.
- A session finishes its turn: within 5 seconds it becomes `Idle` and folds under its workspace; the badge goes down.
- The person closes a session: it leaves the page, and a refresh updates its recap in the history.
- The person clicks a session's link: its stored page, with its prompts and activity.
