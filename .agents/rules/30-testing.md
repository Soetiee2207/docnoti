---
trigger: always_on
---

# Testing Rules

## Principle

Every implementation must have a verification strategy.

## Before Coding

Identify:

- existing tests
- test framework
- linting
- type checking
- build command

## During Coding

Add or update tests for behavior changed by the implementation.

## Validation

At minimum, when applicable:

1. Unit tests
2. Integration tests
3. Type checking
4. Linting
5. Build

## Test Quality

Tests must verify behavior rather than implementation details.

Tests must include important failure cases.

## Never

- delete a failing test merely to make the suite pass
- weaken assertions without justification
- skip validation without reporting it
- claim PASS without executing the relevant command

## Completion

A task is not VERIFIED until the required validation passes.