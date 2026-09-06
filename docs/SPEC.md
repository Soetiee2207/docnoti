# docnoti Product Specification

## 1. Product Definition

docnoti is a local-first document intelligence application.

Its purpose is to help users process large numbers of incoming documents,
understand their contents, identify important information, extract tasks and
deadlines, and convert confirmed actions into calendar events and reminders.

The core product flow is:

Document
→ Ingestion
→ Parsing / OCR
→ Classification
→ AI Analysis
→ Evidence-backed Information
→ Tasks / Deadlines
→ User Confirmation
→ Calendar / Reminder
→ Notification

docnoti is not merely a document summarization application.

Its primary value is transforming documents into trustworthy information
and actionable work.

---

# 2. Product Goals

## 2.1 Primary Goals

docnoti must:

1. Make importing large numbers of documents easy.
2. Automatically process documents after ingestion.
3. Extract readable text from documents.
4. Use OCR for documents where normal text extraction is insufficient.
5. Understand and classify documents.
6. Generate useful summaries.
7. Extract important factual information.
8. Preserve evidence for important extracted information.
9. Extract tasks and deadlines.
10. Distinguish facts from AI inference.
11. Allow users to review and confirm extracted actions.
12. Convert confirmed actions into calendar events or reminders.
13. Provide both an internal calendar and Windows calendar integration.
14. Provide local notifications.
15. Allow users to control whether cloud AI APIs are used.
16. Give users visibility and control over cloud AI costs.
17. Automatically monitor configured folders for new documents.
18. Support batch document ingestion.
19. Keep user documents local by default.

---

# 3. Target User

The primary target user is an individual who receives and processes many
documents during normal work.

A representative user may receive documents through:

- Zalo
- email
- downloaded files
- USB drives
- shared folders
- other applications

The user should be able to move documents into docnoti with minimal manual work.

Zalo integration is not required for V1.

The expected workflow is:

Zalo
→ user downloads document
→ docnoti automatically detects the file
→ document is processed

or:

User
→ drags documents into docnoti
→ documents are processed

---

# 4. Core User Journey

## 4.1 Import

The user can:

- select files manually
- drag and drop files
- import multiple files at once
- configure watched folders

Supported document formats are defined separately from the core product
requirements.

PDF is a required V1 document format.

DOCX support is optional for the initial V1 implementation and may be added
after the core PDF pipeline is stable.

---

## 4.2 Automatic Processing

After a document is imported, docnoti should automatically begin processing.

The conceptual pipeline is:

Import
→ Validate
→ Extract text
→ Determine whether OCR is required
→ OCR when required
→ Normalize content
→ Classify document
→ Analyze document
→ Extract information
→ Extract tasks / deadlines
→ Generate summary
→ Store results
→ Mark processing complete

The user should not need to manually start each processing step.

---

# 5. Document Lifecycle

Every document must have a clearly defined processing state.

At minimum:

- IMPORTED
- PROCESSING
- PROCESSED
- NEEDS_REVIEW
- FAILED

The UI must clearly communicate the current state.

A failed document must contain enough information for the user to understand
that processing failed and, where possible, why.

---

# 6. Document Management

Each imported document must retain metadata including, where applicable:

- original filename
- file type
- file size
- import timestamp
- source path
- processing status
- document type
- processing errors
- analysis version

The original document must remain available to the user.

Users should be able to:

- view documents
- search documents
- inspect document details
- delete documents
- review extracted information
- review tasks and deadlines associated with documents

---

# 7. Document Processing

## 7.1 Text Extraction

docnoti must attempt normal text extraction before OCR.

For text-based documents:

Normal text extraction
→ extracted text

For scanned/image-based documents:

Normal extraction
→ insufficient text detected
→ OCR
→ extracted text

---

## 7.2 OCR

OCR is a mandatory V1 capability.

OCR must be treated as part of the document-processing pipeline rather than
an optional future feature.

The system should support documents where:

- pages contain scanned images
- text is embedded as images
- normal text extraction produces insufficient content

OCR results must remain associated with their source document.

Where possible, extracted text should preserve page boundaries so that later
evidence can reference the original page.

---

# 8. Document Classification

docnoti should classify documents into meaningful document types.

Initial types may include:

- UNKNOWN
- OFFICIAL_DOCUMENT
- ANNOUNCEMENT
- PLAN
- REPORT
- MEETING_DOCUMENT
- ASSIGNMENT
- OTHER

Classification must not prevent the user from manually correcting the type.

Document-specific analysis may use the document type to determine which
information should be prioritized.

Examples:

### Announcement

Prioritize:

- subject
- affected people
- effective date
- important dates
- required actions
- deadlines

### Plan

Prioritize:

- objectives
- milestones
- activities
- responsible parties
- deadlines

### Report

Prioritize:

- executive summary
- key findings
- important numbers
- problems
- recommendations

The exact extraction schema may evolve as more document types are supported.

---

# 9. AI Analysis

AI analysis may be performed using:

- cloud AI APIs
- local AI models

The product must not require a single AI provider.

The architecture must allow different AI providers/models to be configured.

---

## 9.1 Cloud AI

Cloud AI APIs are allowed.

However, cloud processing must be explicitly controlled by the user.

docnoti must not silently send document content to a cloud provider.

The user must be able to:

- enable/disable cloud AI
- select/configure a provider
- configure API credentials
- understand when cloud processing is being used
- monitor estimated/recorded AI usage costs where provider information
  permits
- impose spending or usage limits where technically possible

The system must fail safely when cloud AI is disabled or unavailable.

---

## 9.2 Cost Control

Cloud AI usage is a user-controlled resource.

The product should provide mechanisms for:

- estimated token usage where available
- estimated cost where available
- actual provider-reported usage where available
- per-document usage information
- cumulative usage information
- configurable usage limits
- confirmation before expensive operations when appropriate

docnoti must not repeatedly re-analyze documents without user intent.

---

# 10. Analysis Re-run Policy

A document may be analyzed more than once.

However, automatic repeated analysis should be avoided.

The default behavior is:

Document
→ Analyze once
→ Store result

A new analysis should normally occur only when:

- the user explicitly requests re-analysis
- the analysis configuration/model changes in a way that requires it
- the previous analysis failed
- the user explicitly requests a different analysis

The system should preserve previous analysis results rather than silently
overwriting them.

---

# 11. Analysis Versioning

Analysis results must be versioned.

A document may therefore have:

```text
Document
 ├── Analysis v1
 ├── Analysis v2
 └── Analysis v3
```

Each analysis version should preserve:

- analysis identifier
- document identifier
- creation timestamp
- provider
- model
- relevant configuration
- result
- processing status
- usage information

One version may be designated as the current/active analysis.

Creating a new analysis version must not silently destroy previous versions.

---

# 12. Evidence

Important extracted information must preserve a connection to the source
document.

Evidence should identify, where available:

- source document
- page number
- source text
- source location

The user should be able to move from an extracted claim to its evidence and
then to the original document.

Evidence must be associated with the analysis version that produced it.

---

# 13. Information Semantics

Extracted information must have an explicit semantic status.

At minimum:

- VERIFIED
- INFERRED
- UNCERTAIN

### VERIFIED

The information is directly supported by the source material.

### INFERRED

The information was derived through reasoning and is not stated directly.

### UNCERTAIN

The system cannot reliably determine the information.

The UI must make these distinctions visible.

The system must never silently convert an inference or uncertain result into
a verified fact.

---

# 14. No Hallucinated Facts

AI output must not become a verified document fact merely because an AI model
generated it.

The system must not invent:

- dates
- times
- deadlines
- people
- responsibilities
- locations
- tasks
- document facts

when those details are not supported by source evidence.

When the system cannot determine something reliably, it should mark the
information as uncertain or request user confirmation.

---

# 15. Summary

Every successfully analyzed document should provide a concise summary.

The summary should:

- reflect the source document
- prioritize information relevant to its document type
- avoid unsupported claims
- link important claims to evidence where appropriate
- distinguish uncertainty where relevant

The exact presentation may vary by document type.

---

# 16. Important Information Extraction

The system should extract information that is useful for understanding or
acting on the document.

Examples include:

- people
- organizations
- dates
- times
- locations
- subjects
- amounts
- requirements
- decisions
- important findings
- recommendations
- actions

Extracted information should preserve evidence and semantic status where
applicable.

The exact schema may evolve as document types mature.

---

# 17. Task Domain

Task is a first-class entity.

A task is not merely a field embedded inside a document or summary.

Tasks may be:

- explicitly stated in a document
- inferred by the AI from document context

Every task should preserve its source context.

Conceptually:

```text
Document
   |
   v
Task Suggestion
   |
   v
User Review
   |
   v
Confirmed Task
```

---

# 18. Task Extraction

The system should detect actionable work from documents.

Examples:

- submit a report
- prepare a document
- attend a meeting
- complete an assignment
- send information
- review a request
- perform a required action

Each extracted task should contain, where available:

- title
- description
- status
- deadline
- responsible person
- source document
- source analysis version
- evidence
- confidence
- confirmation state

The system must distinguish explicitly stated tasks from inferred tasks.

---

# 19. Explicit and Inferred Tasks

An explicitly stated task is directly supported by the document.

An inferred task is derived from document context.

Example:

```text
Document:
"Giáo viên nộp báo cáo trước ngày 15/09/2026."

Task:
Nộp báo cáo
status = VERIFIED
```

Example:

```text
Document:
"Cuộc họp ngày 20/09 sẽ thảo luận báo cáo kết quả."

Possible inferred task:
Chuẩn bị báo cáo kết quả
status = INFERRED
```

Inferred tasks should normally require user confirmation before becoming
actionable.

---

# 20. Task Lifecycle

The task lifecycle should support states similar to:

```text
DETECTED
    |
    v
PENDING_CONFIRMATION
    |
    v
CONFIRMED
    |
    v
ACTIVE
    |
    +---- COMPLETED
    |
    +---- CANCELLED
```

The exact state model may be refined during implementation.

Once a task is confirmed, its lifecycle should be independent from the
source document.

---

# 21. Deadline

A deadline belongs to a Task but must preserve the precision of the source.

A deadline may contain:

- date
- optional time
- precision
- status
- confidence
- evidence

If the document contains only a date:

```text
15/09/2026
```

the system must represent:

```text
date = 2026-09-15
time = null
```

It must not invent a time.

If the document explicitly states:

```text
trước 17:00 ngày 15/09/2026
```

the system may represent:

```text
date = 2026-09-15
time = 17:00
```

The source precision must be preserved.

---

# 22. Scheduling

Scheduling is separate from AI analysis.

The flow is:

```text
AI Analysis
    |
    v
Task / Deadline
    |
    v
User Confirmation
    |
    v
Scheduling
    |
    +------------------+
    |                  |
    v                  v
Internal Calendar   Windows Calendar
```

AI analysis must not directly create calendar events.

Concrete scheduling actions require an appropriate user-confirmation
boundary.

---

# 23. Calendar

docnoti must support:

1. an internal calendar
2. Windows calendar integration

The internal calendar must work without an external calendar service.

The Windows integration must be isolated behind an adapter so the core task
domain does not depend directly on Windows-specific APIs.

Future calendar providers may be added without changing the core Task model.

---

# 24. Internal Calendar

The internal calendar is owned by docnoti.

Events may reference:

- task
- deadline
- document
- reminder

Users should be able to view scheduled items and their relationship to
tasks and source documents.

---

# 25. Windows Calendar Integration

Windows Calendar is an external integration.

The exact integration mechanism is a technology decision.

The integration must support, where technically possible:

- creating events
- updating events
- deleting events
- storing external identifiers
- avoiding duplicate external events
- reporting integration errors

External calendar side effects require appropriate user authorization and
confirmation.

---

# 26. Notifications

docnoti must provide local notifications.

Notifications should support both:

- runtime notifications while the application is running
- startup notifications when the application starts

Potential notification events include:

- new documents
- documents requiring review
- processing failures
- upcoming deadlines
- due tasks
- overdue tasks

The system should avoid repeatedly notifying the user about the same event
unless explicitly configured to do so.

---

# 27. Startup Notifications

When configured to start with Windows, docnoti should inspect persisted local
state and surface relevant attention items.

Examples:

- new documents
- upcoming deadlines
- overdue tasks
- failed processing jobs
- documents requiring review

Startup notification behavior must not require cloud services.

---

# 28. Runtime Notifications

While docnoti is running, the application may notify the user about relevant
events.

The notification system must track notification state sufficiently to avoid
unwanted duplicate notifications.

---

# 29. Watched Folders

Watched folders are a required capability.

Users can configure directories that docnoti monitors for supported documents.

The watcher should:

1. detect new files
2. determine whether the file is supported
3. wait until the file is stable
4. perform duplicate detection
5. submit the file to ingestion
6. let the normal processing pipeline handle it

The watcher must not implement OCR, AI analysis, task extraction, or calendar
logic itself.

---

# 30. File Stability

A newly detected file may still be being copied or downloaded.

docnoti must not process a file merely because a filesystem event occurred.

Conceptually:

```text
File Detected
     |
     v
Check Stability
     |
     +---- changing ----> wait/recheck
     |
     +---- stable ------> import
```

The exact stability strategy is an implementation decision.

---

# 31. Batch Import

Batch ingestion is required.

The user should be able to import multiple documents in one operation.

Each document should become an independently trackable processing job.

A failure in one document must not unnecessarily stop unrelated documents.

The UI should show aggregate progress such as:

- total
- queued
- processing
- completed
- failed

---

# 32. Duplicate Detection

docnoti must avoid importing the same document repeatedly.

Duplicate detection may consider:

- content hash
- canonical path
- file metadata
- source identifiers where available

The exact algorithm is an implementation decision.

The system must prevent watcher events, repeated imports, and retries from
creating duplicate document records or duplicate side effects.

---

# 33. Search

V1 must provide local search.

Search should support, where applicable:

- filename
- document metadata
- extracted text
- tasks
- deadlines

V1 does not require:

- vector database
- embeddings
- semantic search
- RAG

These may be introduced later behind a stable search boundary.

---

# 34. UI

Major views should include:

- Dashboard
- Documents
- Document Detail
- Tasks
- Calendar
- Processing / Jobs
- Usage / Cost
- Settings

The UI should prioritize actionable information and clear processing state.

The UI must not contain provider-specific OCR, AI, database, or calendar
implementation logic.

---

# 35. Dashboard

The Dashboard should surface:

- new documents
- documents requiring review
- processing failures
- upcoming deadlines
- overdue tasks
- recent documents
- relevant cloud usage/cost information

The Dashboard should prioritize what requires user attention.

---

# 36. Document Detail

Document Detail should expose:

- document metadata
- processing status
- document type
- summary
- extracted information
- tasks
- deadlines
- evidence
- analysis history
- original document

The user should be able to navigate:

```text
Summary
   ↓
Extracted Information
   ↓
Evidence
   ↓
Original Document
```

---

# 37. Human Confirmation

The system defines a hard boundary before consequential actions.

```text
AI Suggestion
      |
      v
Review
      |
      v
Confirmation
      |
      v
Action
```

Consequential actions include:

- creating calendar events
- creating reminders
- modifying external calendars
- other future external side effects

AI output alone must not bypass this boundary.

---

# 38. Cloud AI Privacy

The default data path is local:

```text
User File
    |
    v
Local Storage
    |
    +--> Local Processing
    +--> Local OCR
    +--> Local AI
```

Cloud processing is an explicit alternative:

```text
Document
    |
    v
Cloud AI Policy
    |
    +---- disabled ----> stay local
    |
    +---- enabled -----> Cloud AI
```

There must be no hidden cloud-upload path.

The application must clearly communicate when cloud AI is being used.

---

# 39. Cloud AI Failure

If cloud AI is enabled but unavailable, docnoti should:

- perform bounded retries for retryable failures
- surface authentication failures
- surface quota/usage-limit failures
- preserve the document and processing state
- mark the job appropriately if processing cannot continue

The application must not silently switch to another paid provider.

Any automatic fallback must be explicitly configured and must respect usage
and cost limits.

---

# 40. Offline Behavior

When cloud AI is disabled or unavailable, the application should continue
working for:

- document storage
- document management
- local text extraction
- local OCR
- task management
- internal calendar
- local notifications
- local search

AI-dependent functionality may be unavailable when no local AI provider is
configured.

The UI must communicate unavailable functionality clearly.

---

# 41. Privacy and Local Data

User documents are local data.

By default:

- documents are stored locally
- structured metadata is stored locally
- processing state is stored locally
- tasks and calendar data are stored locally
- local notifications do not require a remote backend

The application must not upload document content to external services unless
the user has explicitly enabled the relevant feature.

---

# 42. Configuration

Users should be able to configure:

- watched folders
- cloud AI enabled/disabled
- AI provider
- AI model
- usage limits
- notification preferences
- startup behavior
- calendar settings
- processing preferences

Secrets such as API keys should use secure OS credential storage when
available.

---

# 43. Error Handling

The system must distinguish between:

- retryable failure
- permanent failure
- user-action-required failure

Errors should identify:

- affected document
- processing stage
- provider where relevant
- useful diagnostic information

Errors must not cause unrelated documents in a batch to fail unnecessarily.

---

# 44. Performance and Resource Control

The system must bound background processing.

Concurrency should account for:

- CPU
- memory
- OCR capacity
- local AI capacity
- cloud provider rate limits
- cloud usage/cost limits

The application must not start unlimited processing or AI requests.

---

# 45. Data Retention

The original document must remain available while its document record exists.

Analysis versions should remain available according to the product's
retention policy and must not be silently overwritten by re-analysis.

Users should be able to delete documents and associated local data through
explicit application actions.

Exact retention and cleanup policies may be refined during implementation.

---

# 46. Non-Goals for V1

The following are explicitly outside V1:

- mobile application
- multi-user collaboration
- cloud synchronization
- SaaS backend
- mandatory remote server
- official Zalo API integration
- automatic sending of messages or documents
- email integration
- autonomous external side effects
- model fine-tuning
- mandatory RAG
- mandatory vector database
- mandatory multi-agent architecture

These may be considered later if justified.

---

# 47. V1 Acceptance Criteria

## AC-01 — PDF Import

A user can import a PDF manually.

## AC-02 — Drag and Drop

A user can drag a supported PDF into the application.

## AC-03 — Batch Import

A user can import multiple PDFs in one operation.

## AC-04 — Watched Folder

A configured folder can automatically detect and ingest a new supported PDF.

## AC-05 — File Stability

A file that is still being copied is not processed until it is stable.

## AC-06 — Duplicate Prevention

The same document is not repeatedly imported as a new document because of
duplicate import or watcher events.

## AC-07 — Text Extraction

Text-based PDFs have their text extracted.

## AC-08 — OCR

Scanned/image-based PDFs can be processed through OCR.

## AC-09 — Classification

A processed document receives a document type and confidence information,
and the user can correct the type.

## AC-10 — Summary

A successfully analyzed document has a useful summary.

## AC-11 — Evidence

Important extracted information can be traced back to source evidence where
available.

## AC-12 — Information Status

Extracted information can be distinguished as verified, inferred, or
uncertain.

## AC-13 — Task Extraction

The system can identify tasks from a document.

## AC-14 — Deadline Precision

A date-only deadline does not receive an invented time.

## AC-15 — Task Confirmation

Inferred/uncertain actionable tasks require user confirmation before becoming
actionable.

## AC-16 — Task Lifecycle

A confirmed task can be marked active, completed, or cancelled.

## AC-17 — Internal Calendar

A confirmed actionable task can be scheduled in the internal calendar.

## AC-18 — Windows Calendar

The architecture provides a Windows Calendar integration boundary and V1
implementation must support the selected Windows integration mechanism.

## AC-19 — Notifications

The application can issue relevant runtime and startup local notifications.

## AC-20 — Cloud AI Control

The user can explicitly enable or disable cloud AI.

## AC-21 — Cloud Cost Control

Cloud AI usage is recorded and subject to configured usage/cost limits where
technically possible.

## AC-22 — Analysis Versioning

Re-analysis creates a new analysis version rather than silently overwriting
the previous version.

## AC-23 — Restart Recovery

Persisted processing jobs survive application restart and can be resumed or
marked appropriately.

## AC-24 — Bounded Failure

Retries are bounded and failures are surfaced without silently losing the
document.

---

# 48. Future Scope

Potential future capabilities include:

- DOCX processing
- additional document types
- improved document-specific extraction schemas
- local AI improvements
- semantic search
- embeddings
- RAG
- additional calendar providers
- additional OCR engines
- Zalo integration if technically and legally appropriate
- email ingestion
- richer automation
- document relationships
- advanced analytics

Future capabilities must not weaken the local-first, evidence-first, privacy,
cost-control, or confirmation principles.

---

# 49. Open Technology Decisions

The following are intentionally not fixed by this specification:

- programming language
- frontend framework
- desktop runtime
- database technology
- PDF extraction library
- OCR engine
- local AI runtime
- cloud AI providers
- AI SDK
- Windows Calendar integration mechanism
- notification mechanism
- worker implementation
- credential storage mechanism
- packaging mechanism
- auto-start mechanism

These are architecture/technology decisions rather than product
requirements.

---

# 50. Specification Change Policy

This document is the product baseline for V1.

Changes that affect:

- core user journey
- privacy behavior
- cloud AI policy
- task semantics
- evidence requirements
- calendar side effects
- notification behavior
- V1 scope
- acceptance criteria

must be made deliberately.

Significant changes should be documented before implementation.

Agents must not silently change product requirements to make implementation
easier.

---

# 51. V1 Definition of Done

The V1 product is considered ready for release when:

1. Required PDF ingestion works.
2. Batch import works.
3. Watched folders work.
4. Text extraction works.
5. OCR works.
6. Classification works.
7. AI analysis works through the selected provider architecture.
8. Summaries are generated.
9. Important information preserves evidence.
10. Verified/inferred/uncertain states are represented.
11. Tasks and deadlines are extracted.
12. Deadline precision is preserved.
13. User confirmation works.
14. Internal calendar works.
15. Selected Windows Calendar integration works.
16. Runtime and startup notifications work.
17. Cloud AI usage is explicitly controlled.
18. Usage/cost tracking works within the supported provider capabilities.
19. Analysis versioning works.
20. Restart recovery works.
21. Duplicate processing is controlled.
22. Relevant automated tests pass.
23. No critical known privacy or data-loss issue remains.
