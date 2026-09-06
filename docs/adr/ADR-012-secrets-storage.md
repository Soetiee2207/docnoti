# ADR-012: Secrets Storage

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Security
- **Scope:** Local storage of credentials and secrets

---

## Context

`docnoti` may require secrets for external services, including:

- OpenAI API credentials;
- future cloud AI providers;
- future external integrations.

Secrets must not be stored:

- in source code;
- in Git;
- in `AGENTS.md`;
- in configuration files committed to the repository;
- in SQLite as plaintext;
- in logs;
- in document metadata.

The application is primarily a Windows desktop application and should use an operating-system-provided secure credential mechanism.

---

## Decision

`docnoti` will use the **Windows Credential Manager / OS credential store** for sensitive credentials.

Application configuration will store only non-sensitive settings.

Architecture:

```text
Application
    ↓
Secrets Service
    ↓
Credential Store Adapter
    ↓
Windows Credential Manager