# ADR-010 — Windows Calendar Integration

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti extracts tasks and deadlines from documents. Some of these items may
need to become calendar events.

The application is local-first and runs primarily on Windows. Calendar
integration must therefore support:

- internal calendar data
- Windows/external calendar integration
- explicit user confirmation
- clear separation between AI extraction and calendar side effects
- graceful operation when external calendar integration is unavailable

The analysis layer must not directly depend on a specific calendar provider.

## Decision

docnoti uses a calendar abstraction:

```text
CalendarProvider
```

Application services depend on the abstraction rather than directly on a
Windows Calendar API or a specific external calendar implementation.

Conceptual structure:

```text
Task / Deadline
      ↓
Confirmation
      ↓
CalendarService
      ↓
CalendarProvider
      ├── InternalCalendarProvider
      └── WindowsCalendarProvider
```

The exact Windows integration mechanism remains an infrastructure concern.

## Calendar Boundary

AI analysis produces candidate tasks and deadlines.

It does not create calendar events directly.

The required boundary is:

```text
Document
→ Analysis
→ Candidate Task / Deadline
→ Evidence Validation
→ User Confirmation
→ CalendarService
→ CalendarProvider
→ Calendar Event
```

This prevents an uncertain AI inference from immediately causing an external
side effect.

## Internal Calendar

docnoti supports an internal/local calendar representation.

Internal calendar data is stored locally and remains available even when
Windows/external calendar integration is unavailable.

This provides a reliable local-first baseline.

The internal calendar is not required to mirror every external calendar
automatically in V1.

## Windows / External Calendar

A Windows calendar adapter may expose calendar functionality to the
application.

The adapter must be isolated behind `CalendarProvider`.

Application/domain code must not import Windows-specific APIs directly.

Conceptual interface:

```text
CalendarProvider
├── listCalendars()
├── createEvent()
├── updateEvent()
└── deleteEvent()
```

The concrete interface may evolve as implementation details become clearer.

## Confirmation

Calendar creation requires an explicit confirmation boundary when the event
originates from AI-extracted information.

Example:

```text
AI
↓
"Deadline: 30/09/2026"
↓
Evidence
↓
User confirms
↓
Create calendar event
```

The system must not silently create an external event solely because an AI
model returned a deadline.

If the source contains only an ambiguous date/time, the system must preserve
that uncertainty instead of inventing an exact event time.

## Date and Time Rules

The calendar layer must receive normalized date/time data from the application
layer.

CalendarProvider must not infer missing dates or times.

Examples:

```text
"30/09/2026"
→ exact date is available

"cuối tháng"
→ ambiguous; requires appropriate interpretation/confirmation

"trong tuần tới"
→ relative/ambiguous; must not silently become an arbitrary exact date
```

Timezone must be handled explicitly when creating events.

## Evidence and Provenance

Calendar events created from document analysis should retain a reference to
the originating task/analysis where possible.

The system should be able to trace:

```text
Calendar Event
→ Task
→ Analysis Version
→ Evidence
→ Document / Page
```

Calendar provenance is for traceability and does not replace source evidence.

## Failure Handling

External calendar failures must not invalidate the underlying document or
analysis.

For example:

```text
Calendar API unavailable
→ Task remains persisted
→ Calendar action reports failure
→ User can retry
```

Do not silently mark a calendar action as successful.

If an external event is created but confirmation of the final state is
uncertain, the operation must be represented as uncertain rather than creating
a duplicate blindly on retry.

## Idempotency

Calendar creation should use an idempotency strategy where the provider
supports one.

The application should maintain enough local state to avoid accidental
duplicate events during retries.

A retry must distinguish between:

```text
definitely not created
possibly created
definitely created
```

when the provider/API semantics allow this distinction.

## Privacy

Calendar integration must respect local-first principles.

Only the minimum information required for the calendar operation should be
sent to an external calendar provider.

Document source content should not be copied into calendar events unless the
user-facing feature explicitly requires it.

Sensitive source text should not be included in event descriptions by default.

## Provider Independence

The following must remain provider-neutral:

- Task
- Deadline
- CalendarEvent
- CalendarService
- confirmation workflow
- provenance

Provider-specific concepts belong inside the adapter.

This allows future support for another calendar system without changing the
analysis/domain model.

## V1 Scope

V1 supports:

- internal/local calendar representation
- Windows/external calendar integration architecture
- explicit confirmation before consequential event creation
- create/update/delete provider abstraction as supported by the selected
  implementation
- error and retry handling

Advanced synchronization, conflict resolution, recurring-event intelligence,
and full bidirectional synchronization are not required unless separately
specified.

## Consequences

### Positive

- calendar side effects are separated from AI
- supports local-first operation
- Windows integration can evolve independently
- future calendar providers can be added
- failures do not destroy analysis/task data
- provenance can be preserved

### Negative

- requires an abstraction layer
- external calendar semantics may differ between providers
- synchronization and idempotency require additional state
- user confirmation adds an interaction step

## Alternatives Rejected

### Direct Windows API calls from analysis code

Rejected because it couples AI/domain logic to the operating system and makes
testing and future provider support harder.

### Automatic calendar creation from AI output

Rejected because AI output may be uncertain and calendar creation is a
consequential side effect.

### External calendar as the only source of truth

Rejected because docnoti must remain usable when external calendar integration
is unavailable and follows a local-first architecture.

## Invariants

1. AIProvider never creates calendar events directly.
2. Calendar side effects pass through `CalendarService`.
3. Provider-specific APIs stay inside calendar adapters.
4. AI-extracted calendar actions require appropriate user confirmation.
5. Missing or ambiguous dates/times are never silently invented.
6. Calendar failure does not invalidate the source document or analysis.
7. Calendar operations must have a retry/idempotency strategy.
8. Calendar events should remain traceable to their originating task and
   analysis where applicable.
9. Internal/local operation must remain possible without external calendar
   availability.
10. Provider-specific details must not leak into the domain model.
