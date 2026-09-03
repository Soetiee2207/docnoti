---
description: Execute the project's validation suite and determine whether the implementation is actually verified.
---

# Verify

## Steps

1. Inspect project scripts.
2. Determine required validation commands.
3. Run targeted tests.
4. Run type checking when available.
5. Run linting when available.
6. Run build when applicable.
7. Inspect all failures.
8. Confirm the implementation satisfies the acceptance criteria.
9. Report exact commands and results.

## Critical Rule

Never convert UNKNOWN into PASS.

If a required validation could not be executed, report:

NOT VERIFIED