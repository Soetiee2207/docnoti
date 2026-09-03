---
trigger: always_on
---

# Documentation Rules

## Purpose

Documentation exists to preserve important project knowledge.

## Update Documentation When

Update documentation when a change affects:

- architecture
- public interfaces
- data model
- major workflows
- development commands
- important decisions

## Avoid Documentation Noise

Do not document trivial implementation details that can be understood directly from the code.

Do not create documentation merely to increase documentation volume.

## Architecture Changes

When an architectural decision is made, update:

`docs/ARCHITECTURE.md`

and create an ADR when the decision has meaningful long-term consequences.

## Plans

Implementation plans describe work to be done.

They are not a substitute for source code or architecture documentation.