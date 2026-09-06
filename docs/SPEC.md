# docnoti — Product Specification

## 1. Product Definition

docnoti is a local-first document intelligence application.

Its purpose is to help users process large numbers of incoming documents,
understand their contents, identify important information, extract tasks and
deadlines, and convert confirmed actions into calendar events and reminders.

Core flow:

```text
Document
→ Ingestion
→ Parsing / OCR
→ Classification
→ Chunking
→ Embedding
→ Retrieval
→ AI Analysis
→ Evidence
→ Tasks / Deadlines
→ User Confirmation
→ Calendar / Reminder
→ Notification
```

Core principles:

- local-first
- privacy-first
- evidence-first
- source-of-truth preservation
- explicit uncertainty handling
- human confirmation for consequential actions
- controlled cloud AI usage
- local-only embedding
- retrieval before unnecessary full-document LLM context
- reliable background processing

---

## 2. Product Goals

docnoti must:

1. Make importing large numbers of documents easy.
2. Automatically process documents after ingestion.
3. Extract readable text and use OCR when required.
4. Classify documents and support document-specific analysis.
5. Split documents into provenance-preserving chunks.
6. Generate local semantic embeddings for all valid document chunks.
7. Store embeddings locally for semantic retrieval.
8. Retrieve relevant context before AI analysis when appropriate.
9. Generate summaries and structured information.
10. Preserve evidence for important extracted information.
11. Extract tasks and deadlines.
12. Distinguish facts from inference.
13. Allow users to review and confirm extracted actions.
14. Convert confirmed actions into calendar events or reminders.
15. Provide an internal calendar and Windows calendar integration.
16. Provide local notifications.
17. Allow users to control cloud AI and associated costs.
18. Monitor configured folders and support batch ingestion.
19. Keep documents and embeddings local by default.

---

## 3. Core User Journey

### Import

Users can:

- select files manually
- drag and drop files
- import multiple files
- configure watched folders

PDF is required for V1. DOCX is optional and may be added later.

### Automatic Processing

```text
Import
→ Validate
→ Extract Text
→ OCR if required
→ Normalize
→ Classify
→ Chunk
→ Embed
→ Index
→ Retrieve when required
→ Analyze
→ Extract Information
→ Extract Tasks / Deadlines
→ Generate Summary
→ Store Results
```

Processing runs through a persistent background worker.

---

## 4. Document Processing

### Text Extraction

Normal text extraction must be attempted before OCR.

```text
Text PDF
→ Text Extraction

Scanned PDF
→ Text Extraction
→ Insufficient Text
→ OCR
```

### OCR

OCR is mandatory for V1.

Requirements:

- local processing
- Vietnamese support
- page-level provenance
- usable output for scanned/image PDFs

PaddleOCR is the V1 baseline.

### Classification

Initial document types may include:

- UNKNOWN
- OFFICIAL_DOCUMENT
- ANNOUNCEMENT
- PLAN
- REPORT
- MEETING_DOCUMENT
- ASSIGNMENT
- OTHER

Users can manually correct classification.

---

## 5. Chunking

After text extraction/OCR, documents are divided into semantic chunks.

Source of truth:

```text
Document
→ Document Pages
→ Document Chunks
```

Chunking baseline:

- page + paragraph/section
- preserve semantic units
- preserve document/page provenance
- deterministic
- idempotent

Each chunk should retain:

```text
documentId
pageNumber
chunkIndex
content
charStart
charEnd
createdAt
```

If exact character offsets cannot be determined, page provenance must be
preserved rather than invented.

---

## 6. Embedding

### Model

V1 baseline:

```text
jina-embeddings-v5-text-small
```

Embedding must be accessed through:

```text
EmbeddingProvider
```

Domain logic must not depend directly on a specific model.

### Local-only

Embedding is local-only.

```text
Document
→ Pages
→ Chunks
→ Local Embedding Provider
→ Local Vector Index
```

No external embedding API and no silent cloud fallback.

### Coverage

All valid document chunks must be eligible for embedding.

Embedding is derived data, not source of truth.

---

## 7. Vector Storage

V1 uses:

```text
SQLite + vector extension
```

No separate vector database server is required.

Logical relationship:

```text
documents
    ↓
document_pages
    ↓
document_chunks
    ↓
document_embeddings
```

`document_embeddings` should be separate from `document_chunks` to support
future model changes, dimensions, re-embedding, and versioning.

If embedding fails, the document, extracted text, and FTS5 search must remain
usable.

---

## 8. Embedding Background Processing

Embedding runs through the persistent worker:

```text
Document Processed
→ Embedding Job
→ Create / Update Chunks
→ Generate Embeddings
→ Store Vectors
→ Embedding Ready
```

Jobs support:

- PENDING
- PROCESSING
- COMPLETED
- FAILED
- bounded retry
- idempotency
- restart recovery

Retries must not create duplicate vectors.

---

## 9. Search and Retrieval

V1 supports:

```text
SQLite FTS5
+
Vector Search
```

Conceptual flow:

```text
                    Query
                      ↓
             +--------+--------+
             ↓                 ↓
           FTS5          Query Embedding
             ↓                 ↓
       Keyword Search    Vector Search
             ↓                 ↓
             +--------+--------+
                      ↓
              Candidate Merge
                      ↓
                   Rerank
                      ↓
                   Top-K
                      ↓
              Context Builder
```

Initial baseline:

```text
FTS5 candidates      ≈ 20
Vector candidates    ≈ 20
Merged candidates    ≤ 40
Reranked candidates  ≈ 8
```

These are configurable starting points, not fixed product requirements.

Retrieval quality optimization is deferred.

### Scope

Basic filters may include:

```text
documentId?
documentType?
dateRange?
```

Complex filtering is not required for V1.

---

## 10. Reranking

The architecture includes:

```text
Reranker
```

Flow:

```text
Retrieval
→ Candidate Chunks
→ Reranker
→ Final Context
```

The specific reranker implementation is not fixed by this specification.

Optimization is deferred.

---

## 11. Context Builder

The LLM should not receive the entire document by default.

```text
Retrieved Chunks
→ Deduplicate
→ Group by Document
→ Preserve Page Order
→ Apply Context Budget
→ LLM
```

Context must preserve:

- document identity
- page identity
- source text
- provenance
- ordering where appropriate

Context limits must be enforced.

---

## 12. Context Strategy

### Short Document

If the document fits safely within the context budget:

```text
Document
→ Direct Context
→ LLM
```

### Targeted Analysis

For fact extraction, Q&A, task extraction, deadline extraction, and
document-specific analysis:

```text
Analysis Task
→ Retrieval
→ Reranking
→ Context Builder
→ LLM
```

### Long Document

Long documents must not be blindly sent as one LLM request.

```text
Long Document
→ Chunks
→ Chunk Groups
→ Intermediate Analysis / Summaries
→ Higher-level Aggregation
→ Final Analysis / Summary
```

This controls context size, cost, latency, and preserves document coverage.

---

## 13. AI Analysis

AI may use:

- cloud AI APIs
- local AI models

The product must not require a single provider.

AI may perform:

- classification
- summarization
- structured information extraction
- task extraction
- deadline extraction
- document-specific analysis

The AI boundary is:

```text
Retrieval / Context Strategy
→ LLM
→ Candidate Claims
→ Evidence Validation
→ Final Analysis
```

---

## 14. Cloud AI

Cloud AI is opt-in and user-controlled.

Users must be able to:

- enable/disable cloud AI
- configure provider
- configure credentials
- select model
- understand when cloud processing is used
- monitor usage/cost where available
- configure limits where technically possible

When retrieval is appropriate, prefer:

```text
Local Document
→ Local Retrieval
→ Relevant Context
→ Cloud AI
```

rather than:

```text
Full Document
→ Cloud AI
```

Exceptions include short documents and strategies requiring broader coverage.

No hidden cloud-upload path is allowed.

---

## 15. Evidence and Semantics

Important extracted information must preserve:

- source document
- page
- source text
- source location where available
- relevant chunk

Semantic status:

- VERIFIED
- INFERRED
- UNCERTAIN

`VERIFIED` requires direct source support and successful evidence validation.

Retrieval does not itself establish truth.

The system must never invent or silently verify unsupported:

- dates
- times
- deadlines
- people
- responsibilities
- locations
- tasks
- document facts

---

## 16. Analysis Versioning

A document may have multiple analysis versions:

```text
Document
 ├── Analysis v1
 ├── Analysis v2
 └── Analysis v3
```

Each version should preserve:

- identifier
- document identifier
- timestamp
- provider
- model
- relevant configuration
- result
- usage
- evidence
- warnings

Re-analysis must not silently overwrite previous versions.

---

## 17. Tasks and Deadlines

Task is a first-class entity.

Tasks may be explicit or inferred.

Conceptual flow:

```text
Document
→ Task Suggestion
→ User Review
→ Confirmed Task
```

Tasks should preserve:

- title
- description
- status
- deadline
- responsible person where available
- source document
- source page
- analysis version
- evidence
- confidence
- confirmation state

### Deadline Precision

If source contains only:

```text
15/09/2026
```

represent:

```text
date = 2026-09-15
time = null
```

Do not invent a time.

If source explicitly contains a time, that time may be stored.

---

## 18. Scheduling and Calendar

AI analysis must not directly create calendar events.

```text
AI Analysis
→ Task / Deadline
→ User Confirmation
→ Scheduling
→ Calendar
```

V1 supports:

- Internal Calendar
- Windows Calendar integration

Calendar integrations must use adapters.

Consequential external actions require user confirmation.

---

## 19. Notifications

Local notifications support:

- startup notifications
- runtime notifications
- new documents
- processing failures
- documents requiring review
- upcoming deadlines
- due/overdue tasks

Notification state should prevent unwanted duplicates.

Notifications must not require cloud services.

---

## 20. Watched Folders

Watched folders are required.

```text
Detect File
→ Check Stability
→ Validate
→ Duplicate Detection
→ Ingest
→ Normal Processing Pipeline
```

The watcher must not contain OCR, AI, task, or calendar logic.

Files still being copied must not be processed prematurely.

---

## 21. Batch Import and Duplicates

Batch import is required.

Each document is independently trackable.

One failed document must not stop unrelated documents.

Duplicate detection should primarily use content hash.

Watcher events, retries, and repeated imports must not create duplicate
documents or duplicate side effects.

---

## 22. Search UI

V1 local search supports:

- filename
- metadata
- extracted text
- tasks
- deadlines
- keyword search
- semantic search

Search results should expose relevant excerpts and source locations.

Users must be able to navigate to the source document/page.

Retrieval is a shared capability used by search and AI analysis.

---

## 23. UI

Major views:

- Dashboard
- Documents
- Document Detail
- Tasks
- Calendar
- Processing / Jobs
- Usage / Cost
- Settings

UI must not contain provider-specific OCR, AI, embedding, retrieval, database,
or calendar implementation logic.

Dashboard should surface:

- new documents
- review items
- processing failures
- upcoming deadlines
- overdue tasks
- recent documents
- cloud usage/cost
- indexing failures requiring attention

Document Detail should expose:

- metadata
- processing status
- document type
- summary
- extracted information
- tasks
- deadlines
- evidence
- analysis history
- original document
- relevant indexing state

---

## 24. Human Confirmation

Consequential actions follow:

```text
AI Suggestion
→ Review
→ Confirmation
→ Action
```

This includes:

- calendar creation
- reminders
- external calendar changes
- other external side effects

AI output must not bypass this boundary.

---

## 25. Privacy and Offline Behavior

By default, the following remain local:

- documents
- metadata
- processing state
- pages
- chunks
- embeddings
- search indexes
- vector indexes
- tasks
- calendar data

Embedding is always local-only.

When cloud AI is disabled or unavailable, local functions should continue:

- storage
- document management
- PDF extraction
- OCR
- chunking
- embedding
- FTS5 search
- vector retrieval
- tasks
- internal calendar
- notifications

Cloud-dependent analysis may be unavailable without a local AI provider.

No silent cloud fallback is allowed.

---

## 26. Configuration and Secrets

Users should be able to configure:

- watched folders
- cloud AI
- AI provider/model
- usage limits
- notifications
- startup behavior
- calendar
- processing preferences
- embedding/indexing preferences

External secrets must use secure OS credential storage.

API keys must not be stored in:

- source code
- Git
- AGENTS.md
- versioned config
- SQLite application data
- logs
- document metadata

---

## 27. Performance and Reliability

Heavy work must run in the background:

- PDF processing
- OCR
- chunking
- embedding
- AI analysis

The system must bound concurrency based on available resources.

Jobs must support:

- persistence
- restart recovery
- idempotency
- bounded retries
- explicit failure states

Derived indexes must be rebuildable from source data.

Embedding/retrieval failures must not invalidate the original document.

---

## 28. Data Retention

The original document and source pages remain authoritative while the document
exists.

Chunks and embeddings are derived data.

Embeddings must be rebuildable from chunks.

Deleting a document should clean up its dependent local data according to
referential integrity rules.

Analysis history should not be silently destroyed by re-analysis.

---

## 29. Non-Goals for V1

Explicitly outside V1:

- mobile application
- multi-user collaboration
- cloud synchronization
- SaaS backend
- mandatory remote server
- official Zalo API integration
- automatic message/document sending
- email integration
- autonomous external side effects
- model fine-tuning
- mandatory external RAG framework
- cloud vector database
- multi-agent architecture
- distributed worker system
- advanced retrieval optimization
- advanced reranker optimization

Embedding and vector retrieval are part of V1.

Retrieval optimization is deferred.

---

## 30. Future Scope

Potential future capabilities:

- DOCX processing
- additional document types
- improved extraction schemas
- local AI improvements
- embedding model benchmarking
- embedding dimension optimization
- hybrid retrieval optimization
- advanced reranking
- semantic search improvements
- RAG
- additional calendar providers
- additional OCR engines
- additional embedding providers if privacy policy permits
- Zalo integration if appropriate
- email ingestion
- richer automation
- document relationships
- cross-document reasoning
- advanced analytics

Future work must preserve:

- local-first
- privacy-first
- evidence-first
- source-of-truth preservation
- cost control
- human confirmation

---

## 31. V1 Acceptance Criteria

### Document

- [ ] PDF import
- [ ] Drag and drop
- [ ] Batch import
- [ ] Watched folders
- [ ] File stability detection
- [ ] Duplicate prevention
- [ ] Text extraction
- [ ] OCR
- [ ] Classification

### Embedding

- [ ] Deterministic chunking
- [ ] Page/paragraph provenance
- [ ] Local `jina-embeddings-v5-text-small`
- [ ] Full valid chunk coverage
- [ ] SQLite + vector extension
- [ ] Persistent embedding jobs
- [ ] Retry/idempotency/recovery
- [ ] Embedding failure isolation

### Retrieval

- [ ] SQLite FTS5
- [ ] Vector search
- [ ] Hybrid candidate retrieval
- [ ] Candidate merge
- [ ] Reranker boundary
- [ ] Context Builder
- [ ] Context budget
- [ ] Provenance preservation

### AI

- [ ] AIProvider abstraction
- [ ] OpenAI cloud provider
- [ ] Cloud AI opt-in
- [ ] No silent cloud fallback
- [ ] Retrieval-based targeted analysis
- [ ] Long-document hierarchical processing
- [ ] Summary
- [ ] Evidence validation
- [ ] VERIFIED / INFERRED / UNCERTAIN
- [ ] Analysis versioning

### Tasks / Calendar

- [ ] Task extraction
- [ ] Deadline precision
- [ ] User confirmation
- [ ] Task lifecycle
- [ ] Internal calendar
- [ ] Windows Calendar integration
- [ ] Runtime notifications
- [ ] Startup notifications

### Privacy

- [ ] Documents remain local
- [ ] Embeddings remain local
- [ ] Secrets use secure storage
- [ ] Cloud AI is explicitly controlled
- [ ] Relevant context is preferred over full-document cloud prompting
- [ ] No critical data-loss/privacy issue

---

## 32. Architecture Invariants

### INV-01 — Source of Truth

Original documents, pages, and source text are authoritative.

### INV-02 — Derived Embeddings

Embeddings are derived indexes and must be rebuildable.

### INV-03 — Local Embedding

Document content must never be sent to an external embedding service.

### INV-04 — Full Corpus Coverage

All valid document chunks are eligible for embedding.

### INV-05 — Retrieval Before Unnecessary Full Context

Targeted analysis should retrieve relevant context rather than sending the
entire document by default.

### INV-06 — Long-document Control

Long documents use controlled hierarchical processing.

### INV-07 — Evidence Validation

Retrieved content does not automatically establish truth.

### INV-08 — Privacy Boundary

Cloud AI only receives context allowed by user configuration and analysis
strategy.

### INV-09 — Human Confirmation

Consequential AI-generated actions cannot bypass confirmation.

### INV-10 — Failure Isolation

Embedding, vector indexing, and retrieval failures must not destroy or
invalidate source documents.

---

## 33. Definition of Done

A feature is complete only when:

1. Implementation follows the architecture.
2. Appropriate tests exist.
3. Required validation has actually been executed.
4. Privacy invariants are preserved.
5. Evidence/provenance invariants are preserved.
6. No silent cloud fallback exists.
7. Unsupported inference is not represented as verified fact.
8. Background jobs have explicit failure/retry behavior where applicable.
9. Derived indexes remain rebuildable from source data.
10. Relevant documentation is updated.
11. Final diff has been inspected.
12. Acceptance criteria have been checked.
13. The agent does not claim PASS when required validation has not actually
    been executed.

---

## 34. Specification Change Policy

This document is the V1 product baseline.

Changes affecting:

- core user journey
- privacy
- cloud AI
- embedding privacy
- retrieval architecture
- evidence
- task semantics
- calendar side effects
- notification behavior
- V1 scope
- acceptance criteria

must be deliberate.

Significant architecture changes should be documented through an ADR before
implementation.

Required flow:

```text
Requirement Change
→ SPEC
→ ARCHITECTURE
→ ADR
→ Implementation
→ Tests
→ Validation
```

Agents must not silently change product requirements to make implementation
easier.
