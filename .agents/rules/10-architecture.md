---
trigger: always_on
---

# Architecture Rules

## Core Principle

Respect the architecture documented in:

`docs/ARCHITECTURE.md`

## Before Architectural Changes

The agent MUST:

1. Identify the current architecture.
2. Identify the affected boundary.
3. Explain why the current architecture cannot satisfy the requirement.
4. Propose the smallest architectural change.
5. Record a decision when appropriate.

## Dependency Direction

Higher-level business logic must not depend directly on infrastructure details unless explicitly defined by the architecture.

## No Premature Abstraction

Do not introduce:

- generic frameworks
- plugin systems
- unnecessary interfaces
- unnecessary factories
- unnecessary event buses
- unnecessary microservices

unless there is a demonstrated requirement.

## Local-First

docnoti is a local-first application.

Do not introduce cloud infrastructure as a default dependency.

Cloud AI or external services must be explicitly opt-in.

## Data

User documents are local data.

Never commit user documents, generated private data, databases, embeddings, or caches to source control.