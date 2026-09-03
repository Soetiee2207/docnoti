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