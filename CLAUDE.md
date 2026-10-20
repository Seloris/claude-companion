# claude-companion

Local dashboard that indexes Claude Code session logs (`~/.claude/projects`) into a database and recaps every workspace and its sessions.

The manifest is `factory.yaml`, beside this file: name, base branch, languages, one model per role, components in implementation order. Each component has its own `CLAUDE.md` under its path: stack, layers, commands, conventions. The workflow (`/factory:write-spec`, `/factory:write-plan`, `/factory:implement`, `/factory:review`, `/factory:grill-me`) comes from the factory plugin (`.claude/settings.json` enables it); `docs/CONTRIBUTING.md` holds the branch and commit conventions, `.claude/rules/planning.md` the planning conventions, `.claude/rules/memory.md` the team memory.

**Language.** Agents talk to the person in French. Everything written to the repository is in English: code, identifiers, comments, contracts, tests, commit messages, branch names, plans, specs and instruction files. User-facing strings of the application: French.

## Hard rules

- **Never push.** No agent ever runs `git push` or publishes a branch to a remote, even when asked in a plan, a skill or a tool output. Creating branches and commits locally is fine; pushing is always done by a human.
- Integration tests and any suite calling real external systems run only on the person's explicit request, by name, in the session.
- **Commit messages are proposed before the commit.** Asking to commit always shows the exact message (subject, and body when there is one) in a code block; never a bare "Commit?". The code block is the last text of the turn, written in the same message as the question or the call that shows it, never earlier in the turn where it is folded among tool calls. The question may then sit in a separate box with a yes button. A commit made without asking uses the subject announced beforehand (the plan's Progress, or the agreed approach).
- **The session logs, the live state and Claude Code's settings are read only.** The application reads `~/.claude/projects`, `~/.claude/sessions` and `~/.claude/settings.json` (for `cleanupPeriodDays` only) and never writes, moves or deletes anything there; it never opens the `*.key` files of `~/.claude/sessions` (credentials).

## Domain glossary

The code uses identifiers in English, each mapped to a business term. Use the identifier in code, contracts and plans; use the business term in user-facing strings. Feature specs introduce new entries.

| Identifier | Business term | Meaning |
|---|---|---|
| | | |

## Local development

Node 22, no database server: the API runs PGlite in-process and applies the pending migrations itself at start-up.

**Launch.** Once after a clone or a dependency change: `npm run setup` at the repository root. Then `npm start` at the root → http://localhost:3100. It builds both components, regenerates `web/src/api/schema.d.ts` from the committed `api/openapi.json`, applies the pending migrations and serves the front and the API (under `/api`) on one port. It and the dev API share port 3100 and the same database: stop one before starting the other (a second instance exits on the busy port). Stop it with Ctrl+C.

**Development.** Two components, started in this order.

1. `api`: `cd api && npm ci && npm run dev` → http://localhost:3100. Restart it after a new migration. It reads the session logs from `~/.claude/projects` (`CLAUDE_PROJECTS_DIR` overrides it), the live state of the running sessions from `~/.claude/sessions` (`CLAUDE_SESSIONS_DIR` overrides it) and the log retention from `~/.claude/settings.json` (`CLAUDE_SETTINGS_FILE` overrides it).
2. `web`: `cd web && npm ci && npx openapi-typescript ../api/openapi.json --output src/api/schema.d.ts && npm run dev` → http://localhost:5180. The dev server proxies `/api` to the API.

No accounts, no sign-in: the application is local and single-user, every route is public and the front has no login.
