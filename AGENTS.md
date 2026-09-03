# AGENTS.md

## Project

docnoti is a local-first document intelligence application.

Its core purpose is to transform incoming documents into:

Document
→ Understanding
→ Evidence-backed information
→ Tasks / deadlines
→ User-confirmed actions
→ Local notifications

The project prioritizes:

- local-first processing
- privacy
- evidence-backed AI output
- explicit handling of uncertainty
- human confirmation for ambiguous actions
- reliable verification

---

## How You Must Work

Before modifying code:

1. Read this file.
2. Read applicable `.agents/rules/`.
3. Read relevant project documentation.
4. Inspect the existing implementation.
5. Understand the current behavior.
6. Plan non-trivial changes before implementing them.

During implementation:

- make the smallest correct change
- follow existing patterns
- avoid unrelated refactoring
- do not invent requirements
- do not silently change architecture
- do not add speculative features
- do not add dependencies without justification

After implementation:

1. Inspect the final diff.
2. Run relevant tests.
3. Run applicable validation.
4. Verify the acceptance criteria.
5. Report failures or limitations honestly.

Never claim that a task is verified when the required validation has not
actually been executed.

---

## Project Rules

The detailed engineering rules are located in:

`.agents/rules/`

The agent must follow all applicable rules.

---

## Project Documentation

Product requirements:

`docs/SPEC.md`

Architecture:

`docs/ARCHITECTURE.md`

Architecture decisions:

`docs/adr/`

Implementation plans:

`docs/plans/`

Read the relevant documentation before making changes.

---

## Repository Structure

```text
.agents/    Agent rules, workflows and skills
docs/       Project documentation
src/        Application source code
tests/      Automated tests
scripts/    Development and maintenance scripts
data/       Local runtime data