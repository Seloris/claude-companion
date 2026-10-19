# Development process

1. Cut a branch from `develop`: `{type}/{slug}-{name}` (e.g. `feat/orders-cutoff-time`).
2. Work on the branch: one commit per implementation stage, reviewed by the `reviewer` agent when asked (` — with review`); the review of the plan's last stage, or its final review, covers the whole branch and finalizes the plan.
3. Plan finalized: its commits are squashed into one, proposed at the step that finalizes it (later: `/factory:implement … — close the branch`).
4. Push (a human, never an agent), open a PR to `develop`, merge after another person's approval.

# Commit conventions

A simplified Conventional Commits.

## Types

- `feat` – a feature
- `fix` – a bug fix
- `refactor` – restructuring with no functional change
- `perf` – performance
- `style` – formatting, whitespace
- `test` – tests only
- `docs` – documentation (README, `docs/`, `.planning/`)
- `tools` – tooling around the project (`.claude/`, the factory plugin, scripts)
- `ops` – CI/CD, infrastructure
- `chore` – anything else (`.gitignore`…)

## Format

```
<type>(<slug>): <short description>

<long description, optional>
```

- `<slug>`: the feature slug from `.planning/features/`, or `tooling` / `shared` (optional for `chore`, `ops`, `style`).
- A stage commit names its stage before the description: `feat(orders): api — cutoff time per site`.
- The squashed commit of a branch has no stage marker.

## Examples

```
feat(orders): api — list endpoint with cutoff filter
feat(orders): web — orders page
feat(orders): cutoff time on orders           ← the squash
fix(auth): token refresh on 401
docs(orders): plan add-cutoff-time
tools(tooling): factory init
```
