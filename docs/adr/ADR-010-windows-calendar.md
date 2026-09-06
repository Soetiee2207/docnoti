# ADR-010: Windows Calendar

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Calendar integration on Windows

---

## Context

`docnoti` needs calendar functionality for tasks and deadlines extracted from documents.

The product requires two calendar modes:

- internal application calendar;
- Windows/external calendar integration.

The system must not couple task extraction directly to a specific calendar implementation.

Calendar operations may include:

- creating events;
- updating events;
- deleting events;
- viewing scheduled events;
- associating events with tasks;
- preserving source information.

AI extraction and calendar execution must remain separate.

---

## Decision

`docnoti` will use a **Calendar Adapter Architecture**.

The application will expose a common calendar interface:

```text
Application
    ↓
Calendar Service
    ↓
CalendarAdapter
    ├── InternalCalendarAdapter
    └── WindowsCalendarAdapter