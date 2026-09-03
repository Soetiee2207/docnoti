---
trigger: always_on
---

# Core Engineering Rules

## Scope

These rules apply to the entire docnoti workspace.

## General Principles

1. Understand before modifying.
2. Plan before implementing complex changes.
3. Prefer the smallest correct change.
4. Preserve existing working behavior.
5. Do not invent requirements.
6. Do not silently change architecture.
7. Do not claim success without validation.

## Change Discipline

Before modifying files:

- Identify why the file must change.
- Identify dependencies.
- Identify possible side effects.

Do not modify unrelated files.

## Evidence

When a behavior depends on a project requirement, architecture decision, or existing implementation, verify the source rather than guessing.

## Completion

"Implemented" and "Verified" are different states.

A feature may only be reported as VERIFIED after validation has actually been executed.