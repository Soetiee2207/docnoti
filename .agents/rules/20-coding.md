---
trigger: always_on
---

# Coding Rules

## General

Follow the conventions already established in the repository.

Before introducing a new pattern:

1. Search for an existing pattern.
2. Reuse it when appropriate.
3. Introduce a new pattern only when justified.

## Code Quality

Prefer:

- clear names
- small functions
- explicit behavior
- simple control flow
- strong validation
- meaningful errors

Avoid:

- giant functions
- duplicated business logic
- hidden global state
- magic constants
- unnecessary abstractions
- dead code

## Dependencies

Before adding a dependency:

1. Check whether the project already provides equivalent functionality.
2. Check whether the dependency is necessary.
3. Consider maintenance and security.
4. Explain the reason.

Do not add dependencies merely for convenience.

## Error Handling

Errors must be handled at the appropriate boundary.

Do not silently swallow errors.

Do not use generic catch-all handling when the error can be handled specifically.