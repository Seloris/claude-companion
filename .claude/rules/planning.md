---
description: "Feature planning under .planning/: folder layout, dev-plan folder and plan.md structure (one section per component, sub-divided by its layers), Progress and Validation checklists, plan header, reserved slugs, images, ideas and technical debt. Use when writing a spec or a plan."
paths:
  - "**/.planning/**"
---

# Planning conventions

```
.planning/
  features/{slug}/
    00_spec.md                  business-level PRD, one per feature
    assets/                     feature-wide images (mockups, screenshots)
    dev-plans/{YYYYMMDD}-{HHmmss}-{type}-{name}/
      plan.md                   the whole plan
      assets/                   plan-specific images (wireframes, reference designs)
  retros/{YYYYMMDD}-{HHmmss}-{name}.md   one After Action Review per session that taught something
  ideas.md
  technical-debt.md
```

A feature folder holds only `00_spec.md`, `assets/` and `dev-plans/`; `tooling` and `shared` have no spec. Related features stay separate and share a tag in the spec header.

## Spec: `00_spec.md`

Written only through the `write-spec` skill, which holds the spec template and editing rules. Never edit it by hand from a plan or an implementation.

## Dev-plan folder

`{YYYYMMDD}-{HHmmss}-{type}-{name}/`

- Timestamp: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/timestamp.mjs` (the factory plugin's script) and use its output as-is. Never write it by hand.
- `{type}`: `init`, `add`, `fix`, `refactor`, `remove` or `migrate`. `{name}`: kebab-case description.
- A new iteration is a new folder; never edit a past plan. The plan being implemented is not past: `implement` ticks its Progress and records its Deviations. Ticking a plan's Validation after its implementation is allowed: it is how the review and the tests are recorded.
- A plan folder that has never been committed (its `plan.md` is untracked) is a draft `write-plan` is still iterating on with the person: it is not approved, and `implement` never starts from it. A committed plan with uncommitted Progress ticks is not a draft.
- Suggested commit type: `init` / `add` → `feat`, `fix` → `fix`, `refactor` / `remove` / `migrate` → `refactor`.

## `plan.md`

One file, with only the sections the plan needs:

```markdown
# {Title}

Feature: `{slug}` · Components: `api`, `web` · Spec: US-03, FR-02, BR-05

## Context
## Decisions
## {Component 1}
### {Layer 1 of component 1}
### {Layer 2 of component 1}
## {Component 2}
### {Layer …}
## Conventions
## Tests
## Deviations
## Progress
## Validation
```

| Section | Content |
|---|---|
| Header line | Feature slug, the components touched (manifest names, in stage order), spec ids covered. |
| Context | Why this iteration and what it changes. Optional: a Mermaid `flowchart TD` when the interactions are non-trivial. |
| Decisions | Each question the person answered while planning, and each decision spanning several steps: `- {question or decision} → {answer} ({impact})`. |
| Decisions taken autonomously | Written only in autonomous mode (`autopilot`): each question answered without the person, `- {question} → {answer taken} ({reason})`. Absent otherwise. |
| One section per component touched | Named after the component, in stage order, with one `###` subsection per layer of that component's `layers` that the plan touches, in the component's order. Each subsection says what to create or change, precisely enough to implement without guessing: entities, use cases, contracts (routes, request and response fields, authorization), persistence, state and actions, pages and components. Reference the previous component's handoff instead of duplicating its contract. |
| Conventions | Changes to `CLAUDE.md` files, `.claude/` (rules, settings) or the factory plugin: file, change, rationale. Required whenever the plan introduces or changes a convention. |
| Tests | **Mandatory.** Per component: the unit tests to write and the integration tests to add or update, following that component's testing conventions, or "none" with the reason. The implementation writes exactly these tests. |
| Deviations | Written by `implement`, not at planning time: each departure from the plan the person accepted during implementation: `- {what the plan said} → {what was done} ({reason})`. Absent when there is none. |
| Progress | The implementation checklist (below). |
| Validation | The checks run once the implementation is done (below). |

- Omit the sections of untouched components and layers.
- Paths are rooted at the component's `path`.
- When a plan touches several components, `implement` runs it in one session per component, in stage order: a stage with a `handoff` ends by running it and committing its file; the next stage starts with its `prepare`.

### Progress checklist

One checkbox per implementation step, grouped by stage. `implement` ticks each step when it is done and commits the whole stage, ticks included, in one commit at the end of the stage, so a new session knows where to resume.

Each stage starts with its commit subject, the one `implement` uses for the stage's commit, so the person reads it with the plan.

```markdown
## Progress

### Stage 1 — api
Commit: `feat({slug}): api — {summary}`
- [ ] Domain: {short step}
- [ ] Application: {short step}
- [ ] Api: {short step}
- [ ] Handoff: `api/openapi.json` exported

### Stage 2 — web
Commit: `feat({slug}): web — {summary}`
- [ ] Prepare: client regenerated from `api/openapi.json`
- [ ] data: {short step}
- [ ] pages: {short step}
- [ ] ui: {short step}
```

Only the components and layers the plan touches. The Handoff step exists only when the component declares a `handoff`, the Prepare step only when it declares `commands.prepare`. A single-component plan has a single stage.

### Validation checklist

The checks made once every stage is done, one checkbox each, in a section of their own after Progress (never under it: a step under Progress belongs to a stage). Write only the items that apply:

```markdown
## Validation

- [ ] Review: the `reviewer` agent on the plan's implementation, its findings settled
- [ ] Tests: the full `test` command of `{components}` green on the plan's final code
- [ ] Browser test: the change tested in `web` (`test-in-browser` skill)
- [ ] Integration tests: `{names}` green
```

- **Review:** always. The review of the plan's last stage covers the whole plan (from the commit that added `plan.md` to `HEAD`, plus the uncommitted changes) and ticks it once no finding is left, fixed or left open with the person's agreement. The reviews of the earlier stages do not tick it. When the last stage leaves it unticked (findings on another component, or a plan implemented before this rule), `/factory:review {plan folder}` or `implement`'s final review ticks it (`/factory:implement {plan folder} — final review` once every stage is ticked).
- **Tests:** whenever a touched component declares `commands.test`, listing those components. Each stage runs its own component's full suite already; this item records one run of every listed suite, in full, on the plan's final code. Ticked when all of them passed; a code change after the tick re-runs every listed suite, or unticks it.
- **Browser test:** only when a touched component declares a `url`. Ticked when every scenario passed.
- **Integration tests:** only when the Tests section names integration tests of a component that declares `commands.integration_tests`, listed in the item. Ticked when the person asked for the run and every test passed.

The checklist is the only record of these checks: an item absent or unticked means the check was not done. Review is never skipped; the other items are optional: each stays `[ ]` (not run), is ticked (run and green) or is marked `[-]` with the reason when the person declined it, e.g. `- [-] Browser test: not run (declined by the person)`, so the plan says it was not run and why. The tick or the mark goes in the commit of the fixes it led to, or in a commit of the plan alone (`chore({slug}): validation — {item}`), proposed to the person first.

The plan is **finalized** once every stage of Progress and `Review` are ticked; the optional items do not hold it back. The step that finalizes it (the last stage, the final review, `/factory:review {plan folder}`) then proposes to squash the branch's commits (the plan's, each stage's, the review's and the validations') into one, on the person's yes; a squash put off runs later with `/factory:implement {plan folder} — close the branch`. The checklist needs no item for it.

## Plan header

Infer the header instead of asking for it, and state it at the top of the plan proposal so the person can correct it:

- **Feature slug:** list `.planning/features/` and reuse an existing slug first; say whether it is existing or new.
- **Components:** the manifest components the plan touches, in stage order (none for `tooling` unless it touches a component).
- **Branch:** on the base branch, a new `{commit type}/{slug}-{name}` (commit type as above), or `feat/{slug}` for a spec written before any plan; on another branch, that branch. Whoever creates the branch (`write-spec` for a spec on its own, `write-plan` for a plan, `implement` for a request without a plan) has the person validate its name first.

## Reserved slugs

| Slug | For | `plan.md` sections |
|---|---|---|
| `tooling` | `CLAUDE.md` files, `.claude/`, the factory plugin, CI/CD, build config, non-plan docs | Free-form sections instead of the component sections |
| `shared` | Cross-feature refactors, multi-feature migrations, global auth or middleware | Standard component sections |

Neither has a `00_spec.md`.

## Images

Save an image the person shares at the moment it is shared: in the plan's `assets/` by default, in the feature's `assets/` when it outlives the iteration. Name it in kebab-case after its content and reference it from `plan.md` or the spec: `![what it shows](./assets/{name}.png)`.

## Retros: `.planning/retros/`

Written only through the `retro` skill, which holds their template: one file per session, with or without a plan, its lessons `open` until `/factory:retro apply` applies, rejects or forwards them. Once committed, a retro changes only in its lessons' Status.

## Ideas: `.planning/ideas.md`

The person's ideas, not yet specified, grouped by scope: one section per component, feature or `app`, a new scope's section added at the bottom; in a section, new items appended at the bottom, no priorities or metadata:

```
## <scope>

- {YYYY-MM-DD} — **<Short title>:** <The idea in a sentence or two, as the person put it>.
```

Title: 3–6 words, sentence case. An idea that spans several scopes goes under `app`. An agent appends an idea only when the person asks, in their words; it never reorders, rewrites or removes one. The person removes an idea once it has become a spec, or once dropped.

## Technical debt: `.planning/technical-debt.md`

A flat list, no sections, priorities or metadata, new items appended at the bottom:

```
- **<Short title> (<scope>):** <One sentence stating what is wrong or missing, not how to fix it>. See [<File>](<relative-path>).
```

Title: 3–6 words, sentence case. Scope: component, layer or feature names. Link only the most relevant file(s).
