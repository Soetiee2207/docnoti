# docnoti — System Architecture

## 1. Architecture Overview

docnoti is a local-first desktop application.

The system is organized into clear boundaries:

```text
UI
 ↓
Application Services
 ↓
Domain / Processing Pipeline
 ↓
Repositories / Infrastructure
 ↓
SQLite + Local File Storage
```

External capabilities are isolated behind adapters/providers:

```text
AIProvider
OCRProvider
EmbeddingProvider
Reranker
CalendarAdapter
NotificationProvider
SecretsService
```

Core processing flow:

```text
Document
→ Ingestion
→ PDF Processing / OCR
→ Pages
→ Classification
→ Chunks
→ Embeddings
→ Search Indexes
→ Retrieval
→ Context Builder
→ AIProvider
→ Evidence Validation
→ Analysis
→ Tasks / Deadlines
→ User Confirmation
→ Calendar / Notification
```

---

# 2. Architecture Principles

## 2.1 Local-first

Documents, pages, chunks, embeddings, indexes, tasks, and application state
remain local by default.

## 2.2 Source of Truth

The authoritative document data is:

```text
Original Document
→ Document Pages
→ Source Text
```

Everything else is derived data.

## 2.3 Evidence-first

AI claims must be traceable to source pages/text.

Retrieval provides context but does not establish truth.

## 2.4 Provider Abstraction

External or replaceable capabilities must use stable interfaces.

Examples:

```text
AIProvider
OCRProvider
EmbeddingProvider
Reranker
CalendarAdapter
NotificationProvider
SecretsService
```

## 2.5 Failure Isolation

Failure of a derived processing stage must not unnecessarily invalidate the
source document.

Example:

```text
Embedding FAILED
    ↓
Document remains usable
    ├── source document
    ├── extracted pages
    └── FTS5 search
```

## 2.6 Background Processing

CPU/network intensive work must execute through persistent background jobs.

---

# 3. Runtime Architecture

The V1 runtime consists of:

```text
Tauri 2
├── React + Vite frontend
├── Rust native layer
└── Local application data
```

Frontend responsibilities:

- UI
- user interactions
- presentation state
- invoking application services

Native layer responsibilities:

- filesystem-sensitive operations
- SQLite access
- OS integration
- notifications
- autostart
- secure credential access
- other Tauri capabilities

---

# 4. Frontend Architecture

Baseline:

```text
React
├── Layout
├── Dashboard
├── Documents
├── Document Detail
├── Tasks
├── Calendar
├── Jobs
├── Settings
└── Usage
```

Frontend must not directly implement:

- SQLite queries
- PDF parsing
- OCR engine calls
- embedding model calls
- vector search implementation
- cloud provider logic
- Windows calendar APIs

UI communicates through application services/hooks.

---

# 5. Application Service Layer

Application services coordinate use cases.

Examples:

```text
IngestionService
PDFProcessingService
OCRService
ChunkingService
EmbeddingService
AnalysisService
RetrievalService
TaskService
CalendarService
NotificationService
```

Services coordinate repositories and providers but should not contain UI logic.

---

# 6. Document Data Model

Core relationship:

```text
Document
   │
   ├── Document Pages
   │       │
   │       └── Source Text
   │
   ├── Document Chunks
   │       │
   │       └── Embeddings
   │
   ├── Analyses
   │
   └── Tasks
```

The original document remains the root entity.

Derived data must reference the document rather than replacing it.

---

# 7. Storage Architecture

V1 storage consists of:

```text
SQLite
+
Managed Local File Storage
```

SQLite stores:

- document metadata
- processing jobs
- pages
- chunks
- embeddings
- analyses
- tasks
- deadlines
- calendar records
- notification state
- search metadata

Original PDF files are stored separately in managed local application
storage.

---

# 8. Database Architecture

SQLite is the primary application database.

Drizzle ORM is the application-facing database abstraction.

Rust/Tauri provides the native SQLite execution boundary.

Conceptually:

```text
React / TypeScript
       ↓
Drizzle
       ↓
SQLite IPC Boundary
       ↓
Rust / rusqlite
       ↓
SQLite
```

The database must support transactions for operations requiring consistency.

SQLite WAL mode should be used where appropriate.

---

# 9. Document Ingestion

Ingestion flow:

```text
User / Watched Folder
        ↓
File Validation
        ↓
Checksum
        ↓
Duplicate Detection
        ↓
Managed Storage Copy
        ↓
SQLite Transaction
        ↓
Document Record
        ↓
Processing Job
```

If database persistence fails after copying the file, the managed file copy must
be cleaned up.

Ingestion must be idempotent.

---

# 10. PDF Processing

PDF processing is implemented behind:

```text
PDFProcessor
```

Baseline implementation:

```text
PDF.js
```

Responsibilities:

- open PDF
- extract page text
- extract metadata where available
- preserve page boundaries
- determine whether OCR is needed

PDF processing writes to:

```text
document_pages
```

---

# 11. OCR Architecture

OCR is isolated behind:

```text
OCRProvider
```

Baseline:

```text
PaddleOCR
```

Architecture:

```text
PDF Page
   ↓
Page Renderer
   ↓
OCRProvider
   ↓
OCR Result
   ↓
Document Page
```

OCR is local-only.

Temporary OCR assets must remain inside controlled application temporary
storage and be cleaned after processing.

---

# 12. Classification Architecture

Classification is an application capability rather than a storage concern.

Conceptually:

```text
Document Pages
      ↓
Classification Context
      ↓
AIProvider
      ↓
Document Type
      ↓
Persisted Classification
```

Classification must preserve confidence and analysis provenance where
applicable.

---

# 13. Chunking Architecture

Chunking runs after page text is available.

```text
Document Pages
      ↓
ChunkingService
      ↓
Document Chunks
```

Baseline strategy:

```text
Page
+
Paragraph / Section
```

Chunks preserve:

```text
documentId
pageNumber
chunkIndex
content
charStart
charEnd
createdAt
```

Chunking must be deterministic and idempotent.

`document_pages` remains the source of truth.

---

# 14. Embedding Architecture

Embedding is a local secondary indexing pipeline.

```text
Document Pages
      ↓
ChunkingService
      ↓
Document Chunks
      ↓
EmbeddingService
      ↓
EmbeddingProvider
      ↓
Vector Storage
```

The baseline embedding model is:

```text
jina-embeddings-v5-text-small
```

The application must depend on:

```text
EmbeddingProvider
```

rather than the model directly.

Embedding is local-only.

No cloud embedding provider is allowed in the default V1 architecture.

---

# 15. Embedding Data Model

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

`document_embeddings` should contain at minimum:

```text
id
chunkId
model
dimensions
embedding
createdAt
```

The embedding record must identify which model produced it.

This allows re-embedding and future model changes.

---

# 16. Vector Storage

V1 uses:

```text
SQLite + vector extension
```

There is no separate vector database service.

Vector data is local application data.

The vector index is derived from document chunks and must be rebuildable.

Vector storage failure must not invalidate source documents.

---

# 17. Embedding Worker

Embedding is a persistent background job.

```text
Document Processed
        ↓
Embedding Job
        ↓
Chunk / Update Chunks
        ↓
Generate Embeddings
        ↓
Persist Vectors
        ↓
Completed
```

Job states:

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

Requirements:

- bounded retry
- idempotency
- restart recovery
- duplicate prevention

Embedding jobs should use the existing persistent worker architecture.

---

# 18. Search Architecture

V1 has two search paths:

```text
Keyword Search
→ SQLite FTS5

Semantic Search
→ Query Embedding
→ SQLite Vector Search
```

Both can feed the same retrieval service.

```text
                RetrievalService
                     ↓
          +----------+----------+
          ↓                     ↓
     FTS5 Search          Vector Search
          ↓                     ↓
          +----------+----------+
                     ↓
              Candidate Merge
                     ↓
                  Reranker
                     ↓
                Final Context
```

Search optimization is deliberately deferred.

---

# 19. Retrieval Architecture

Retrieval is a shared application capability.

Consumers include:

- search
- Q&A
- task extraction
- deadline extraction
- document-specific analysis
- long-document processing where appropriate

The retrieval flow is:

```text
Query / Analysis Task
        ↓
+---------------------------+
| FTS5       Vector Search  |
+---------------------------+
        ↓
Candidate Merge
        ↓
Reranker
        ↓
Top-K
        ↓
Context Builder
```

Initial candidate values are configuration:

```text
FTS5 ≈ 20
Vector ≈ 20
Merged ≤ 40
Final ≈ 8
```

---

# 20. Retrieval Scope

Retrieval may support:

```text
documentId?
documentType?
dateRange?
```

Filtering should happen as early as practical to reduce candidate volume.

Complex query filtering is not required for the initial implementation.

---

# 21. Reranker Architecture

Reranking is represented by:

```text
Reranker
```

Flow:

```text
Candidate Chunks
      ↓
Reranker
      ↓
Ranked Chunks
```

The concrete reranker implementation is replaceable.

The initial implementation may use a simple baseline.

Advanced reranker optimization is deferred.

---

# 22. Context Builder Architecture

Context Builder converts retrieved chunks into provider-ready context.

```text
Retrieved Chunks
      ↓
Deduplicate
      ↓
Group
      ↓
Order
      ↓
Context Budget
      ↓
AI Request Context
```

Responsibilities:

- remove duplicate chunks
- preserve document identity
- preserve page identity
- preserve source text
- preserve provenance
- preserve page order where useful
- enforce context limits
- produce provider-neutral context

Context Builder must not directly call an AI provider.

---

# 23. Context Strategy

Analysis requests select an appropriate strategy.

```text
Analysis Task
      ↓
Context Strategy
      ├── Direct Context
      ├── Retrieval Context
      └── Hierarchical Long-document Context
```

### Direct Context

Used when a short document safely fits the context budget.

### Retrieval Context

Used for targeted tasks.

```text
Task
→ Retrieval
→ Rerank
→ Context Builder
→ LLM
```

### Hierarchical Context

Used for long documents.

```text
Document
→ Chunks
→ Chunk Groups
→ Intermediate Results
→ Aggregation
→ Final Result
```

---

# 24. AI Architecture

AI access is abstracted through:

```text
AIProvider
```

Current provider structure:

```text
AIProvider
└── CloudAIProvider
    └── OpenAI
```

The architecture remains open to future local or additional providers.

AIProvider must expose a stable analysis contract.

AI provider code must not be embedded inside domain entities or UI components.

---

# 25. AI and Retrieval Boundary

AI should receive context selected by the context strategy.

Preferred targeted flow:

```text
Document
→ Local Pages
→ Local Chunks
→ Local Retrieval
→ Context Builder
→ AIProvider
→ Analysis
```

The full document should not be sent to the LLM by default.

Short documents may use direct context.

Long documents use hierarchical processing.

---

# 26. Evidence Architecture

AI output produces candidate claims and evidence.

```text
AIProvider
      ↓
Candidate Analysis
      ↓
Evidence Validator
      ↓
Validated Analysis
      ↓
Analysis Repository
```

Evidence must reference source content.

Validation should check:

- page exists
- cited source text exists
- source text matches the stored page content
- provenance is valid

Invalid evidence must not remain `VERIFIED`.

---

# 27. Semantic Status

Analysis results use:

```text
VERIFIED
INFERRED
UNCERTAIN
```

The status is part of the analysis domain model.

Rules:

```text
Direct + validated evidence
→ VERIFIED

Reasoned but not directly stated
→ INFERRED

Insufficient or invalid support
→ UNCERTAIN
```

Retrieval relevance is not equivalent to verification.

---

# 28. Analysis Persistence

Analyses are versioned.

```text
Document
 ├── Analysis v1
 ├── Analysis v2
 └── Analysis v3
```

The repository tracks:

- version
- active version
- provider
- model
- result
- evidence
- warnings
- usage
- timestamps

Failed analysis must not create a new successful analysis version.

---

# 29. Task Architecture

Task is a first-class domain entity.

```text
Document
   ↓
Analysis
   ↓
Task Extraction
   ↓
Task
```

Task preserves:

- source document
- source page
- analysis version
- evidence
- semantic status
- deadline
- confirmation state

Tasks can outlive the immediate analysis request.

---

# 30. Scheduling Architecture

Scheduling is separated from analysis.

```text
Analysis
   ↓
Task
   ↓
User Confirmation
   ↓
CalendarService
   ↓
CalendarAdapter
```

Adapters:

```text
InternalCalendarAdapter
WindowsCalendarAdapter
```

AI must not directly invoke external calendar side effects.

---

# 31. Notification Architecture

Notifications use:

```text
NotificationProvider
```

Baseline:

```text
Tauri / Windows Native Notification
```

Notification logic should be separated from task and processing logic.

Notification state is persisted locally to prevent unwanted duplicates.

---

# 32. Background Worker Architecture

A persistent SQLite-backed worker manages asynchronous processing.

Jobs include:

- document pipeline
- OCR
- embedding
- analysis
- other future processing jobs

Generic lifecycle:

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED

or

PROCESSING
   ↓
FAILED
   ↓
Retry
```

Worker requirements:

- atomic job claim
- bounded retries
- idempotency
- restart recovery
- isolated failures

---

# 33. Repository Architecture

Repositories isolate persistence.

Examples:

```text
DocumentRepository
DocumentPageRepository
DocumentChunkRepository
DocumentEmbeddingRepository
ProcessingJobRepository
AnalysisRepository
TaskRepository
CalendarRepository
```

Repositories should expose domain-oriented operations rather than leaking
raw database details into UI code.

---

# 34. Secrets Architecture

Secrets are accessed through:

```text
SecretsService
```

Baseline implementation:

```text
Windows Credential Manager
```

Secrets must not be persisted in:

- source code
- Git
- SQLite
- logs
- application configuration files containing plaintext secrets

Cloud AI credentials remain outside normal document data.

---

# 35. File Storage Architecture

Original documents are copied into managed application storage.

Conceptually:

```text
Application Local Data
└── documents
    └── <document-id>.pdf
```

The application must validate file access and prevent path traversal.

User source paths are metadata, not authority to access arbitrary files after
ingestion.

---

# 36. Security Boundaries

Important boundaries include:

```text
UI
 ↓
Application Service
 ↓
Validated Infrastructure Boundary
```

Native filesystem access must be restricted.

Stored documents must be accessed through controlled application paths.

External network access must only occur through explicitly configured
providers.

Cloud AI requests must respect cloud-enabled configuration.

---

# 37. Privacy Data Flow

Default:

```text
User File
    ↓
Local Storage
    ↓
Local PDF Processing
    ↓
Local OCR
    ↓
Local Chunking
    ↓
Local Embedding
    ↓
Local Retrieval
```

When Cloud AI is enabled:

```text
Local Retrieval
    ↓
Relevant Context
    ↓
Cloud AI
```

Embedding remains local in both cases.

There is no automatic full-document upload path.

---

# 38. Failure Boundaries

Each stage has an independent failure boundary:

```text
Ingestion
   ↓
PDF Processing
   ↓
OCR
   ↓
Chunking
   ↓
Embedding
   ↓
Indexing
   ↓
Analysis
   ↓
Task Extraction
   ↓
Scheduling
```

A failure should affect only the dependent stage where possible.

For example:

```text
Embedding Failure
→ Vector Search unavailable
→ FTS5 remains available
→ Document remains available
```

Cloud AI failure must not delete or corrupt local document state.

---

# 39. Rebuildability

Derived data should be rebuildable from authoritative local data.

Examples:

```text
Document Pages
→ Chunks

Chunks
→ Embeddings

Pages / Chunks
→ FTS5 Index

Chunks
→ Vector Index
```

This allows index recovery and model migration without re-importing original
documents.

---

# 40. Configuration Boundaries

Configuration should control:

- cloud AI enabled/disabled
- AI provider/model
- usage limits
- watched folders
- notifications
- startup
- calendar integration
- processing concurrency
- embedding/indexing settings

Configuration must not bypass privacy or evidence invariants.

---

# 41. Dependency Direction

Preferred dependency direction:

```text
UI
 ↓
Application Services
 ↓
Domain Contracts
 ↓
Infrastructure Implementations
```

Examples:

```text
AnalysisService
→ AIProvider

EmbeddingService
→ EmbeddingProvider

RetrievalService
→ SearchProvider / VectorStore / Reranker

CalendarService
→ CalendarAdapter

NotificationService
→ NotificationProvider
```

Concrete infrastructure must not become the domain contract.

---

# 42. V1 Technology Baseline

```text
Language              TypeScript
Desktop Runtime       Tauri 2
Frontend              React + Vite
UI                     shadcn/ui + Tailwind CSS
Database               SQLite
DB Access              Drizzle ORM
PDF Processing         PDF.js
OCR                    PaddleOCR
AI Abstraction         AIProvider
Cloud AI V1            OpenAI API
Local AI               Architecture-ready
Background Worker      Persistent SQLite-backed worker
Keyword Search         SQLite FTS5
Embedding Model        jina-embeddings-v5-text-small
Vector Storage         SQLite + vector extension
Reranking              Reranker abstraction
Windows Calendar       Calendar adapter
Notifications          Tauri / Windows native
Secrets                Windows Credential Manager
Packaging              Tauri Bundler
Autostart               Tauri autostart capability/plugin
```

---

# 43. V1 Processing Pipeline

The complete V1 pipeline is:

```text
                    File
                     ↓
                 Ingestion
                     ↓
              PDF Processing
                     ↓
                OCR if needed
                     ↓
               Document Pages
                     ↓
                Classification
                     ↓
                  Chunking
                     ↓
               Document Chunks
                     ↓
                Embedding Job
                     ↓
          Local Embedding Provider
                     ↓
              Vector Extension
                     ↓
                 Search Index
                     ↓
              Analysis Request
                     ↓
              Context Strategy
                     ↓
          +----------+----------+
          ↓                     ↓
        Direct              Retrieval
        Context          ├── FTS5
          │              ├── Vector
          │              ├── Merge
          │              └── Rerank
          │                     ↓
          │              Context Builder
          +----------+----------+
                     ↓
                  AIProvider
                     ↓
             Evidence Validation
                     ↓
                Analysis Result
                     ↓
              Tasks / Deadlines
                     ↓
              User Confirmation
                     ↓
           Calendar / Notification
```

---

# 44. Long-document Architecture

Long documents use hierarchical processing:

```text
Document
   ↓
Pages
   ↓
Chunks
   ↓
Chunk Groups
   ↓
Intermediate Analysis
   ↓
Higher-level Aggregation
   ↓
Final Analysis
```

Intermediate results should retain source references.

The final result must remain traceable to the underlying document pages.

---

# 45. Search Optimization Strategy

The initial architecture intentionally favors correctness and clear boundaries
over aggressive optimization.

Initial baseline:

```text
FTS5 + Vector
      ↓
Merge
      ↓
Rerank
      ↓
Top-K
```

Future optimization may evaluate:

- candidate counts
- score normalization
- hybrid weighting
- embedding dimensions
- chunk size
- overlap
- reranker models
- caching
- query expansion

These are implementation/optimization concerns and must not change the
fundamental architecture without an explicit decision.

---

# 46. Architecture Invariants

The following are mandatory:

1. Original documents/pages remain the source of truth.
2. Embeddings are derived data.
3. Embeddings are local-only.
4. All valid chunks are eligible for embedding.
5. SQLite remains the primary local database.
6. Vector storage uses SQLite + vector extension.
7. FTS5 and vector retrieval can operate together.
8. Retrieval is separated from AI provider logic.
9. Reranking is an independent boundary.
10. Context Builder controls what reaches the LLM.
11. Targeted analysis should avoid unnecessary full-document prompting.
12. Long documents use controlled hierarchical processing.
13. Evidence must be validated against source content.
14. AI inference cannot silently become verified fact.
15. Consequential actions require user confirmation.
16. Derived-index failure must not invalidate source documents.
17. No silent cloud fallback.
18. Background processing must be persistent and recoverable.

---

# 47. Architecture Change Policy

Architecture changes must be deliberate.

When a significant architecture decision changes:

```text
Requirement
→ SPEC
→ ARCHITECTURE
→ ADR
→ Implementation
→ Tests
→ Validation
```

Technology details may evolve through ADRs without rewriting the product
requirements.

Agents must not silently change architecture to simplify implementation.

---

# 48. Definition of Done

An architecture-dependent implementation is complete when:

- the defined boundary is implemented
- dependencies follow the intended direction
- persistence is correct
- failure behavior is defined
- privacy invariants are preserved
- provenance is preserved
- relevant tests pass
- final diff is inspected
- actual validation is executed
- documentation remains consistent with implementation
