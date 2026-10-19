# Session activity (activité des sessions) — PRD

> **Slug**: `session-activity`
> **Tags**: #sessions
> **Status**: Approved
> **Last updated**: 2026-10-19

## TL;DR

The recap of a session shows its prompts and its tokens, nothing about what Claude Code did with them: which skills ran, which agents were launched, which tools were called. This feature records that activity for every session, shows it on the session's page, and adds a dashboard of statistics: the most used agents, skills and tools, per workspace and over a period.

## Problem

The person runs a plugin-driven workflow (specs, plans, implementation, reviews, runners) across several workspaces. Questions like "which agents does this project rely on", "how often do I run the reviewer and what does it cost in tokens", "which MCP servers do I really use", "which skills are called and by whom" have no answer today: the session logs hold every tool call, but the application keeps only the prompts, and the logs themselves disappear after 30 days.

## Non-goals

- Live updates while a session runs, and the state of the sessions in progress: the next feature (`#sessions`).
- The content of tool calls: inputs, outputs, file diffs, command output. Only what identifies a call is kept.
- The full text of the prompts sent to subagents: a subagent is identified by its type and its short description.
- A cost in dollars: tokens only.
- Claude Code's internal attachments and reminders (hook output, system reminders, deferred tool listings): never counted as activity.
- Comparing two periods, exporting the statistics, or any alert.

## Domain Glossary

Canonical entity names introduced or reused. Names only: no properties, relationships or persistence.

| Business term | Identifier | Business meaning | Status |
|---|---|---|---|
| `Session` | `Session` | One Claude Code conversation, from one log file, with its subagents | Reused |
| `Sous-agent` | `Subagent` | A helper agent a session launched; it has a type and runs on a model | Reused |
| `Prompt` | `Prompt` | A message or a slash command the person typed in a session | Reused |
| `Appel d'outil` | `ToolCall` | One invocation of a tool by Claude Code, in a session or in one of its subagents | New |
| `Outil` | `Tool` | What a `ToolCall` invokes, by name: a built-in tool, an MCP tool, the skill tool or the agent tool | New |
| `Serveur MCP` | `McpServer` | A server providing MCP tools; its tools are grouped under its name | New |
| `Appel de skill` | `SkillCall` | One run of a skill, whether the person typed its slash command or Claude Code invoked it | New |
| `Type d'agent` | `AgentType` | The kind of subagent launched (reviewer, runner, explorer…), as the plugin or the project names it | New |
| `Période` | `Period` | The time window the dashboard's statistics cover | New |

## Functional Requirements

### Activity of a session

- **FR-01** — A refresh records, for each session, every `ToolCall` of the session and of its subagents: the tool's name, when it was called, whether it failed, and which subagent made it when it was not the session itself.
- **FR-02** — A refresh records every `SkillCall` of a session: the skill's name, its arguments, when it ran, and whether the person typed it or Claude Code invoked it.
- **FR-03** — A refresh records, for each `Subagent`, its `AgentType`, its model, the short description Claude Code gave it, its tokens per model and its number of tool calls, so that an agent's cost and work are visible.
- **FR-04** — A session's record gains its number of tool calls, of failed tool calls, of skill calls and the list of its agent types.
- **FR-05** — The person can start a full refresh that re-reads every log file, so that the sessions stored before this feature get their activity; the regular refresh keeps reading only new and changed files.
- **FR-06** — The session's page shows its activity in order: the prompts, the skill calls and the subagents launched, interleaved by time, so that the person reads what happened after each prompt.
- **FR-07** — The session's page shows its subagents with their type, model, description, tokens and number of tool calls, and its tool calls summed per tool, failed calls apart.

### Dashboard

- **FR-08** — A dashboard page shows statistics for a `Period` chosen by the person (last 7 days, last 30 days, last 90 days, all time; 30 days by default), over all workspaces or one workspace chosen by the person.
- **FR-09** — The dashboard shows the totals of the period: sessions, prompts, tokens, tool calls, skill calls, subagents launched.
- **FR-10** — The dashboard ranks, over the period: the agent types by number of runs and by tokens, the skills by number of calls, the tools by number of calls, the MCP servers by number of calls, the models by tokens, so that the person sees what the workflow relies on and what it costs.
- **FR-11** — When the dashboard covers all workspaces, each ranking can be broken down by workspace, so that "the most used agents per workspace" is one click away.
- **FR-12** — The dashboard shows the activity over time of the period: sessions and tokens per day.
- **FR-13** — A workspace's page links to the dashboard filtered on that workspace, and a session's page links to its workspace's dashboard.
- **FR-14** — The Scratch group follows the workspaces page's switch: its sessions enter the dashboard's statistics only while the group is shown.

## Business Rules

- **BR-01** — A slash command the person typed counts as a `SkillCall` of the skill of the same name; Claude Code's built-in commands (`compact`, `clear`, `model`, `login`, `plugin`…) are not skills and are never counted as such.
- **BR-02** — A skill is named exactly as it was called, plugin prefix included: `factory:implement` and `implement` are two skills, because they may come from two different plugins.
- **BR-03** — The skill tool and the agent tool are tools: their calls count in the tool totals, and are in addition recorded as skill calls and subagent runs.
- **BR-04** — A tool whose name follows the MCP naming (`mcp__{server}__{tool}`) belongs to that `McpServer`; any other tool is a built-in tool.
- **BR-05** — A tool call made by a subagent counts toward its session, like its tokens (session-ingestion BR-05's spirit): the session's totals are what the session really did.
- **BR-06** — A session belongs to a `Period` by its start time; a session that started before the period and ended inside it is out of the period.
- **BR-07** — Archived sessions count in the dashboard like any other: keeping the history after Claude Code deletes the logs is the point of the application.
- **BR-08** — A tool call whose result never came (the session was interrupted) is neither a success nor a failure: it counts as a call, not as a failed call.
- **BR-09** — A subagent whose log file is missing from the session folder still counts as launched, from the agent tool's call in the session: its type and description are known, its tokens and tool calls are zero.

## UX Flow

- The person opens a session: after its facts, the activity timeline (prompts, skill calls, subagents in order), then the subagents table, then the tools table.
- From the workspaces page, the person opens the dashboard: the period selector, the workspace selector (all by default), the totals, the rankings, the activity over time.
- The person picks a period or a workspace: every block updates.
- On "all workspaces", the person expands a ranking to see it per workspace.
- From a workspace's page, the person opens the dashboard already filtered on it.
- After updating the application, the person starts a full refresh from the refresh control; the data already stored stays browsable meanwhile, and the report says how many sessions were re-read.
