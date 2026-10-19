---
description: "Team memory: shared, versioned project facts that are not obvious from the code, and how to add, promote or remove an entry. Always relevant."
---

# Team memory

Shared, versioned memory for every agent and every teammate. It holds stable project facts that are not obvious from the code and not yet covered by a `CLAUDE.md` or another rule file.

## How to use it

- **Add** a one-line entry when you learn a fact the next session would otherwise have to rediscover: the person corrected you, or finding it took real searching. Write the fact and, if useful, why, with the date: `- 2026-09-30 — Fact. Why it matters.`
- **Don't add** one-off task details, anything the code or git history already shows, or personal preferences (those go to your personal memory).
- **Workflow lessons** (how to spec, plan or implement, what the reviewer should check) go into the project's own notes in the relevant component `CLAUDE.md`, or as a change to the factory (its skills and rules), not here.
- **Promote** an entry that has become a convention for a component into its `CLAUDE.md` (or a `.claude/rules/` file), and remove it here.
- **Fix or remove** an entry you find wrong or stale; never leave two entries that contradict each other.
- Keep this file under ~50 entries. Changes go through the normal review like any other file.

## Entries

## Known failing tests

Tests that already fail on the base branch, independently of the current work. When a test fails, check this list first: if it is here, do not investigate it or re-run it without your changes to prove it, just mention it in the report. Add a test here once you have proven it fails without your changes; remove it when it is fixed.
