# Architecture & Codebase Audit

- **Date:** 2026-09-07
- **Role:** Senior Software Architect & Technical Lead
- **Project:** docnoti (Local-first Document Intelligence Desktop Application)
- **Baseline Documents Reviewed:**
  - `AGENTS.md`
  - `docs/SPEC.md`
  - `docs/ARCHITECTURE.md`
  - `docs/adr/ADR-001` through `docs/adr/ADR-013`
- **Source Inspected:**
  - `src/` (TypeScript frontend, services, repositories, DB client, migrator)
  - `src-tauri/` (Rust native backend, SQLite commands, local storage, OCR bridge)
  - `tests/` (Automated Vitest suite — 9 test files, 60 passing tests, 1 skipped)
  - `scripts/` (`ocr_runner.py` Python PaddleOCR runner)
  - `package.json`, `Cargo.toml`, `tauri.conf.json`
  - Database schema & migrations (`src/db/schema.ts`, `src/db/migrations/`)

---

## 1. Current Implementation Status

| Capability | Status | Evidence | Gap |
| :--- | :--- | :--- | :--- |
| **Project bootstrap** | **VERIFIED** | `package.json`, `Cargo.toml`, `tauri.conf.json`, `tsconfig.json`, `vite.config.ts`. Full Vitest suite executes and passes (9 files, 60 tests). | Build scripts for release packaging not fully exercised in CI. |
| **Application shell** | **IMPLEMENTED** | `src/App.tsx`, `src/components/layout/Header.tsx`, `Sidebar.tsx`, `DashboardOverview.tsx`, `DocumentsView.tsx`, `SettingsView.tsx`. | Views for Tasks, Calendar, and Watched Folders use static mockups without live service bindings. |
| **SQLite/database** | **VERIFIED** | `src-tauri/src/db.rs` (`db_execute`, `db_query`), `src/db/client.ts` (Drizzle remote proxy), `src/db/migrator.ts`, migrations `0000`, `0001`, `0002`. Verified in `tests/ingestion.test.ts`. | Missing schemas & tables for `document_chunks`, `document_embeddings`, `tasks`, `calendar_events`, `notifications`. |
| **Document ingestion** | **VERIFIED** | `src/services/ingestionService.ts`, `src-tauri/src/storage.rs`. SHA-256 duplicate detection, PDF header check, managed file copying, DB transaction rollback. Verified in `tests/ingestion.test.ts`. | User-configured max file size threshold is not yet exposed in configuration. |
| **PDF processing** | **VERIFIED** | `src/services/pdf/pdfJsProcessor.ts`. Page text extraction, metadata, page numbering, `needsOcr` detection. Verified in `tests/pdfProcessor.test.ts`. | PDF rendering for UI preview currently relies on raw file access rather than structured page viewer. |
| **OCR** | **VERIFIED** | `scripts/ocr_runner.py` (PaddleOCR Vietnamese `lang="vi"`), `src-tauri/src/ocr.rs`, `src/services/ocr/`. Verified in `tests/ocr.test.ts` & `tests/paddleOcr.integration.test.ts`. | Requires external Python environment with PaddleOCR installed; no packaged standalone binary yet. |
| **Background processing** | **PARTIAL** | `src/services/worker/documentWorker.ts`, `src/repositories/processingJobRepository.ts`. PENDING, PROCESSING, COMPLETED, FAILED, bounded retries. Verified in `tests/worker.test.ts`. | **No crash recovery on application startup** (stale `processing` jobs remain stranded); `claimJob` has race condition under concurrent workers; no `embed` job type. |
| **AIProvider** | **VERIFIED** | `src/services/ai/types.ts` (`AIProvider` interface, `ModelMetadata`, `ProviderAvailability`), `MockAIProvider`. Verified in `tests/aiAnalysis.test.ts`. | Local AI provider (e.g. llama.cpp / ONNX) is an abstraction stub; only Mock and OpenAI exist. |
| **OpenAIProvider** | **VERIFIED** | `src/services/ai/openAiProvider.ts`. Strict JSON schema prompt, verbatim citation enforcement, token tracking, retry classification. Verified in `tests/openAiProvider.test.ts`. | Real smoke test against live API skipped in CI when `OPENAI_API_KEY` is not present (by design). |
| **AnalysisService** | **VERIFIED** | `src/services/ai/analysisService.ts`. Orchestrates request preparation, provider dispatch, evidence verification, and persistence. Verified in `tests/analysisPipeline.test.ts`. | **Architectural mismatch:** sends raw full document pages directly to AIProvider, bypassing chunking, retrieval, and context builder. |
| **Evidence validation** | **VERIFIED** | `AnalysisService.validateEvidence`. Verifies citation page existence, non-empty text, and exact normalized verbatim quote presence. Downgrades unverifiable claims to `UNCERTAIN`. Verified in `tests/aiAnalysis.test.ts`. | Character offset ranges (`charStart`, `charEnd`) are not yet resolved against page coordinates. |
| **Analysis versioning** | **VERIFIED** | `src/repositories/analysisRepository.ts`, table `document_analyses`. Incremental `version` integer, `isActive` flag, preserves full history. Verified in `tests/analysisPipeline.test.ts`. | No UI comparison view between historical versions yet. |
| **EmbeddingProvider** | **NOT_STARTED** | Zero files in codebase. No interface, no contract defined in TypeScript or Rust. | Entire abstraction missing. |
| **jina-embeddings-v5-text-small**| **NOT_STARTED** | Zero files in codebase. Model runtime not selected, not downloaded, no runner. | Entire model execution pipeline missing. |
| **Document chunks** | **NOT_STARTED** | No `document_chunks` table in `schema.ts`, no `ChunkingService`. | Entire chunking domain model and persistence missing. |
| **Vector storage** | **NOT_STARTED** | `Cargo.toml` has `rusqlite = { version = "0.33", features = ["bundled"] }` without vector extensions (`sqlite-vec` or `sqlite-vss`). No vector virtual tables. | Vector storage engine and schema completely missing. |
| **SQLite FTS5** | **NOT_STARTED** | No FTS5 virtual table in `migrator.ts` or `schema.ts`. No full-text search repository or queries. | Lexical search infrastructure missing. |
| **Hybrid retrieval** | **NOT_STARTED** | No `RetrievalService`, no candidate pool merging logic. | Entire retrieval pipeline missing. |
| **Reranker** | **NOT_STARTED** | No `Reranker` interface or implementation. | Abstraction missing. |
| **ContextBuilder** | **NOT_STARTED** | No `ContextBuilder` class. `AnalysisService` passes all pages directly. | Context assembly, budgeting, and deduplication missing. |
| **Task** | **NOT_STARTED** | Only a 9-line stub in `src/types/task.ts`. `TasksView.tsx` uses hardcoded mock tasks. No table in SQLite. | Task entity, extraction logic, persistence, and service are missing. |
| **Deadline** | **NOT_STARTED** | No deadline precision parser (date vs datetime vs null), no storage. | Missing. |
| **Internal calendar** | **NOT_STARTED** | No calendar entities, schemas, or service. | Missing. |
| **Windows calendar** | **NOT_STARTED** | No `CalendarProvider` or Windows Calendar adapter. | Missing. |
| **Windows notifications** | **NOT_STARTED** | `tauri-plugin-notification` is not in `Cargo.toml`. No scheduler or notification state table. | Missing. |
| **SecretsService** | **PARTIAL** | `src/services/secrets/index.ts` defines interface `SecretsService` and `InMemorySecretsService`. Verified in tests. | Missing persistent OS-backed implementation. |
| **Windows Credential Manager** | **NOT_STARTED** | No `keyring` crate in `Cargo.toml`. No Tauri commands bridging Windows Credential Manager. | OS-level secure credential storage missing. |
| **Watched folders** | **NOT_STARTED** | Mentioned only in `SettingsView.tsx` UI mockup. No native directory watcher or stability detection. | Native watcher missing. |
| **Batch import** | **IMPLEMENTED** | `DocumentIngestionService.ingestMultiple` in `src/services/ingestionService.ts`. Verified in `tests/ingestion.test.ts`. | UI batch progress and multi-file drag-and-drop feedback need enhancement. |
| **Packaging** | **PARTIAL** | `src-tauri/tauri.conf.json` contains bundling config for Windows installer (`nsis`/`msi`). | Release build scripts, signing, and installer artifact tests have not been executed. |
| **Auto-start** | **NOT_STARTED** | `tauri-plugin-autostart` is not installed or configured in `Cargo.toml` or `tauri.conf.json`. | Missing. |

---

## 2. Documentation vs Implementation

### Missing Implementation (Documentation specifies, Code lacks)
1. **Embedding & Vector Pipeline (`ADR-009`, `SPEC §6-7`, `ARCH §14-16`):**
   - `EmbeddingProvider` interface and local execution engine (`jina-embeddings-v5-text-small`).
   - SQLite vector extension integration in Rust (`rusqlite` currently has no vector extension loaded).
   - `document_chunks` table and `ChunkingService` with paragraph/section boundaries and page provenance.
   - `document_embeddings` table storing model metadata, dimensions, and vectors.
2. **Search & Retrieval Boundary (`ADR-009`, `SPEC §9-11`, `ARCH §18-22`):**
   - SQLite `FTS5` virtual table and synchronizer.
   - `RetrievalService` running parallel FTS5 and Vector queries with candidate merging.
   - `Reranker` interface and default passthrough/scoring implementation.
   - `ContextBuilder` applying context budgets, page ordering, and provenance packaging.
3. **Tasks & Calendar Domain (`ADR-010`, `SPEC §17-18`, `ARCH §29-30`):**
   - `tasks` table and repository with evidence tracking, semantic status (`VERIFIED`/`INFERRED`/`UNCERTAIN`), and confirmation states.
   - Deadline precision resolution (separating explicit date from explicit time).
   - `CalendarService` and `CalendarProvider` (internal SQLite calendar and Windows calendar adapter).
4. **Native Integrations (`ADR-011`, `ADR-012`, `ADR-013`):**
   - Windows Credential Manager adapter for `SecretsService` (currently only `InMemorySecretsService` exists).
   - Windows Native Notifications (`tauri-plugin-notification` is absent).
   - Windows Auto-start capability (`tauri-plugin-autostart` is absent).
   - Watched folder native filesystem monitor with file stability checking.
5. **Background Worker Crash Recovery (`ADR-008`):**
   - Recovery routine upon startup to detect stale `processing` jobs and requeue/fail them.

### Undocumented Implementation (Code contains, Documentation lacks)
1. **`CanvasPageRenderer` (`src/services/ocr/pageRenderer.ts`):**
   - Architecture documents `Page Renderer` as a concept, but does not document that PDF page rasterization for OCR currently runs in the frontend webview via HTML5 `<canvas>` at 2.0x scale rather than a headless Rust renderer (`pdfium` / `image`).
2. **`MockAIProvider` & `MockOCRProvider`:**
   - The production codebase contains complete mock providers with simulated Vietnamese document extraction and OCR bounding boxes. While ADR-006 mentions mock provider for tests, their active role as defaults in `getAppServices()` is not documented in `ARCHITECTURE.md`.
3. **PaddlePaddle CPU MKLDNN Workaround:**
   - `scripts/ocr_runner.py` sets specific environment variables (`PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=0`, `FLAGS_use_mkldnn=0`) to bypass CPU instruction faults in PaddlePaddle 3.3.x on Windows.

### Architecture Mismatches (Code conflicts with Architectural Decisions)
1. **AnalysisService Directly Bypasses Retrieval & ContextBuilder (CRITICAL):**
   - *Architecture Decision (`ARCH §25`, `ARCH §43`, `ADR-006`, `ADR-009`, `SPEC §11-12`):*
     Targeted document analysis must retrieve relevant context via chunks, merge candidates, rerank, and package context via `ContextBuilder` before calling `AIProvider`. The entire document must NOT be sent to the LLM by default.
   - *Current Code (`src/services/ai/analysisService.ts:L52-72`):*
     `prepareRequest()` takes all records from `document_pages`, maps them into raw strings, and feeds the entire document directly into `OpenAIProvider`.
   - *Consequence:* This violates Architecture Invariant `INV-05` ("Retrieval Before Unnecessary Full Context") and causes high token costs, potential context window overflow for long documents, and leaks unneeded pages to Cloud AI.
2. **Secrets Storage Boundary Is In-Memory Only (HIGH):**
   - *Architecture Decision (`ADR-012`, `ARCH §34`):*
     `SecretsService` must persist external credentials (specifically `OPENAI_API_KEY`) securely in Windows Credential Manager.
   - *Current Code (`src/services/secrets/index.ts`):*
     Only `InMemorySecretsService` exists. Secrets are lost on every application restart. Users cannot save their API key persistently without either re-entering it every session or placing it in plaintext config.
3. **Background Worker Claim Is Non-Atomic (MEDIUM):**
   - *Architecture Decision (`ADR-008`):*
     Worker must atomically claim jobs to prevent concurrent processing races.
   - *Current Code (`src/repositories/processingJobRepository.ts:L63-81`):*
     `claimJob()` performs a `SELECT` query, inspects status in JavaScript, and then executes an `UPDATE ... WHERE id = :id`. Under multiple concurrent workers or rapid polling, two processes can both read `status == 'pending'` and attempt to process the same job.

### Potential Conflicts
1. **Document Classification Taxonomy Mismatch:**
   - `docs/SPEC.md §4` defines V1 baseline classes as: `UNKNOWN`, `OFFICIAL_DOCUMENT`, `ANNOUNCEMENT`, `PLAN`, `REPORT`, `MEETING_DOCUMENT`, `ASSIGNMENT`, `OTHER` (administrative/governmental).
   - `src/services/ai/types.ts:L3-11` and `openAiProvider.ts:L32-41` define: `INVOICE`, `CONTRACT`, `OFFICIAL_NOTICE`, `RECEIPT`, `BANK_STATEMENT`, `TAX_DOCUMENT`, `REPORT`, `OTHER` (commercial/financial).
   - *Impact:* Automated tests currently enforce the commercial taxonomy (`INVOICE`, `CONTRACT`), whereas the product specification describes government/office document types.
2. **Job Type Naming:**
   - `ADR-008` lists uppercase: `INGEST_DOCUMENT`, `PROCESS_DOCUMENT`, `OCR_DOCUMENT`, `ANALYZE_DOCUMENT`, `EMBED_DOCUMENT`.
   - Code in `schema.ts` and `documentWorker.ts` uses lowercase strings: `document_pipeline`, `ocr`, `analysis`.

---

## 3. Embedding & Retrieval Readiness

Evaluation of the target pipeline:
```text
Document Pages
→ Chunker
→ Document Chunks
→ Embedding Queue
→ EmbeddingProvider
→ jina-embeddings-v5-text-small
→ SQLite + Vector Extension
```
and:
```text
Query
→ FTS5 + Vector Search
→ Merge Candidates
→ Reranker
→ ContextBuilder
→ AIProvider
```

### Readiness Checklist:
- **Embedding runs local-only:** NOT READY. No local embedding execution runtime is wired up.
- **EmbeddingProvider separated from AIProvider:** READY IN DESIGN, UNIMPLEMENTED IN CODE. `AIProvider` exists in isolation; `EmbeddingProvider` is not yet created.
- **`document_pages` is source of truth:** READY. `document_pages` table is correctly populated and maintained by PDF.js and PaddleOCR with page provenance.
- **`document_chunks` preserves provenance:** NOT READY. Neither the chunking schema nor chunking service exists.
- **Embedding is secondary index:** READY IN PRINCIPLE. The architecture treats it as derived, but no database table (`document_embeddings`) exists yet.
- **Embedding failure does not make document unusable:** READY IN DESIGN. Architecture specifies isolation, but worker has no embedding job logic yet.
- **Retrieval does not directly call AIProvider:** READY IN DESIGN.
- **ContextBuilder is boundary between retrieval and AIProvider:** NOT READY. `ContextBuilder` does not exist; `AnalysisService` passes raw pages directly to `AIProvider`.
- **FTS5 + vector retrieval run in parallel:** NOT READY. Neither FTS5 nor vector extension is configured in SQLite.
- **Reranker is an abstraction:** NOT READY. Reranker abstraction does not exist.
- **Search/index can be rebuilt:** NOT READY. Since chunks and index schemas are absent, rebuild procedures cannot be implemented.

---

## 4. Background Processing Readiness

- **Persistent job state:** IMPLEMENTED & VERIFIED. Table `processing_jobs` persists `id`, `document_id`, `job_type`, `status`, `retry_count`, `max_retries`, `timestamps`, `error_message`.
- **State transitions:** IMPLEMENTED. Transitions between `pending` → `processing` → `completed` / `failed` are verified in `tests/worker.test.ts`.
- **Bounded retries:** IMPLEMENTED. `failOrRetry()` checks `retryCount < maxRetries` (default 3), transitioning to `pending` with incremented counter or `failed` on exhaustion.
- **Crash recovery:** **NOT IMPLEMENTED (CRITICAL GAP).** There is no startup routine querying for jobs stuck in `processing`. If the application exits unexpectedly, any in-flight job will remain permanently trapped in `processing` and never re-executed.
- **Idempotency:** PARTIAL.
  - Ingestion prevents duplicate files via checksum.
  - PDF processing replaces page records idempotently.
  - OCR updates page records idempotently.
  - Analysis checks for active job.
  - *Gap:* `claimJob` in `processingJobRepository.ts` is not an atomic conditional query (`UPDATE ... WHERE id = :id AND status = 'pending'`), making it vulnerable to race conditions if concurrency > 1.
- **Job dependencies:** PARTIAL. Sequential chaining exists: `document_pipeline` auto-creates `ocr` job if `needsOcr`, and auto-enqueues `analysis` if `autoAnalyze` is true.
- **Embedding jobs:** NOT IMPLEMENTED. Worker has no handler for `embed` jobs.

---

## 5. Privacy & Security Readiness

- **Document storage local:** VERIFIED. Original files are stored in `app_local_data_dir/documents/`. `src-tauri/src/storage.rs` enforces that target paths must strictly reside inside the managed directory to prevent directory traversal.
- **Embedding local-only:** INVARIANT PRESERVED IN DESIGN. No external embedding API is used or referenced. Local model (`jina-embeddings-v5-text-small`) is mandated by ADR-009.
- **Cloud AI opt-in:** VERIFIED. Default configuration has `cloudEnabled: false` and `providerType: 'mock'`. `AIProviderSelector` throws an explicit `AIError` if OpenAI is selected without explicit opt-in.
- **No silent cloud fallback:** VERIFIED. When OpenAI fails (auth, network, rate limit), the pipeline does not fall back to mock or local models silently; it marks the job and document as failed.
- **API key not in SQLite:** VERIFIED. Neither `documents`, `document_analyses`, nor `processing_jobs` store API keys or secrets.
- **API key not in job payload:** VERIFIED. Jobs only store document reference and job type.
- **Secrets go through SecretsService:** VERIFIED AT CODE LEVEL. `OpenAIProvider` requests credentials from `SecretsService.getSecret('openai_api_key')`.
- **Logs do not contain secrets:** VERIFIED. Error messages and log outputs do not print credentials.
- **Cloud AI receives only authorized context:** **UNRESOLVED DEFECT.** Because `ContextBuilder` and retrieval are missing, `AnalysisService` currently sends all document pages to OpenAI. While authorized by the opt-in setting, it exposes more document context than intended by the privacy architecture.

---

## 6. Testing Readiness

### Current Test Suite Status:
- **Total Test Files:** 9
- **Total Tests:** 61 (60 passed, 1 skipped)
- **Suite Execution Time:** ~26 seconds (including PaddleOCR model spin-up and PDF parsing)

### Test Coverage Breakdown:
1. **Fully Automated & Passing:**
   - Document Ingestion: path validation, checksum generation, managed storage copying, storage rollback on DB failure, batch ingestion (`tests/ingestion.test.ts`).
   - PDF Processing: text extraction, page numbering provenance, `needsOcr` detection for blank/scanned pages (`tests/pdfProcessor.test.ts`).
   - OCR Engine & Provider: Canvas rendering, PaddleOCR execution, Vietnamese text recognition, idempotency, bounded retry (`tests/ocr.test.ts`, `tests/paddleOcr.integration.test.ts`).
   - Background Worker: job claim, state updates, retry exhaustion, sequential pending job processing (`tests/worker.test.ts`).
   - AI Provider & Orchestration: Mock provider, OpenAI provider format validation, error handling, opt-in enforcement, evidence validation downgrade to UNCERTAIN, analysis versioning (`tests/aiAnalysis.test.ts`, `tests/openAiProvider.test.ts`, `tests/analysisPipeline.test.ts`).
2. **Implemented but Untested in Automated Suite:**
   - Tauri Native IPC commands (`db_execute`, `db_query`, `import_pdf_file`, `run_ocr_on_image`) when running inside the actual compiled WebView rather than the proxy test harness.
   - UI views (`DocumentsView.tsx`, `DashboardOverview.tsx`, `SettingsView.tsx`).
3. **Capabilities Requiring Integration / Real-World Tests:**
   - Real OpenAI API smoke test (`tests/realOpenAiSmoke.integration.test.ts` is currently skipped unless `OPENAI_API_KEY` is provided in environment).
   - Real Windows Credential Manager integration (once implemented).
   - Full end-to-end user journey: User drops PDF in UI → Tauri backend copies file → Worker processes PDF → Worker runs OCR → Worker runs Analysis → Results appear on UI.

---

## 7. Critical Issues

### [BLOCKER]
*(None preventing immediate next architectural phase; existing codebase builds, runs, and passes all 60 tests cleanly).*

### [HIGH]
1. **ISSUE-H1: AnalysisService Bypasses Retrieval & ContextBuilder**
   - *Impact:* Long documents or multi-page files send all raw pages directly to OpenAI. Violates privacy invariant INV-05 and causes high token costs and potential context window overflow.
   - *Affected Components:* `src/services/ai/analysisService.ts`.
2. **ISSUE-H2: SecretsService Lacks Windows Credential Manager Backend**
   - *Impact:* API keys exist only in memory and are discarded on app restart. Violates ADR-012 requirement for OS-protected persistent storage.
   - *Affected Components:* `src/services/secrets/index.ts`, `src-tauri/Cargo.toml`.
3. **ISSUE-H3: Missing Background Worker Crash Recovery**
   - *Impact:* Any unexpected shutdown or crash leaves jobs in `processing` state forever with no automatic resurrection.
   - *Affected Components:* `src/services/worker/documentWorker.ts`, `src/repositories/processingJobRepository.ts`.

### [MEDIUM]
1. **ISSUE-M1: Non-atomic Job Claim in `ProcessingJobRepository`**
   - *Impact:* `claimJob` performs non-atomic select-then-update. Potential race condition if multiple workers or polling loops execute simultaneously.
   - *Affected Components:* `src/repositories/processingJobRepository.ts`.
2. **ISSUE-M2: Document Classification Taxonomy Discrepancy**
   - *Impact:* `SPEC.md §4` defines Vietnamese administrative types, but code and prompt enforce commercial/financial types.
   - *Affected Components:* `src/services/ai/types.ts`, `src/services/ai/openAiProvider.ts`, `docs/SPEC.md`.
3. **ISSUE-M3: Missing Task Domain Model and Schema**
   - *Impact:* Tasks are represented as mock UI data. No `tasks` table, repository, or extraction service exists.
   - *Affected Components:* `src/types/task.ts`, `src/db/schema.ts`, `src/components/tasks/TasksView.tsx`.

### [LOW]
1. **ISSUE-L1: Missing Native Plugins in `Cargo.toml`**
   - *Impact:* `tauri-plugin-notification` and `tauri-plugin-autostart` are not yet declared.
   - *Affected Components:* `src-tauri/Cargo.toml`.
2. **ISSUE-L2: Page Text Preview in UI Uses Direct File Read**
   - *Impact:* Frontend renders raw text instead of structured page thumbnails.
   - *Affected Components:* `src/components/documents/DocumentDetailModal.tsx`.

---

## 8. Recommended Implementation Order

To respect architecture dependencies and minimize rework, the implementation sequence must follow the data flow:

```text
Document Pages
    ↓
[Phase 1: Chunking & Chunks Storage]
    ↓
[Phase 2: Local Embedding & Vector Store + FTS5]
    ↓
[Phase 3: Hybrid Retrieval, Reranker & ContextBuilder]
    ↓
[Phase 4: Wire ContextBuilder into AnalysisService & Long-Doc Strategy]
    ↓
[Phase 5: Tasks & Deadlines Domain Layer]
    ↓
[Phase 6: Windows Integrations (Credential Manager, Calendar, Notifications, Autostart)]
```

### Detailed Order:
1. **Step 1 — Document Chunking Pipeline (Prerequisite for everything search/retrieval):**
   - Migration for `document_chunks` table (with documentId, pageNumber, chunkIndex, content, charStart, charEnd).
   - `DocumentChunkRepository`.
   - `ChunkingService` with deterministic page + paragraph chunking logic preserving page provenance.
   - Unit tests for chunking and provenance.
2. **Step 2 — Worker Crash Recovery & Atomic Claim:**
   - Implement `recoverStaleJobs()` on `DocumentWorker` startup.
   - Fix `claimJob()` to be an atomic conditional update (`WHERE status = 'pending'`).
3. **Step 3 — SQLite FTS5 Full-Text Search:**
   - Migration creating FTS5 virtual table for document pages/chunks.
   - Search repository for keyword queries with excerpt extraction.
4. **Step 4 — Local Embedding Provider & Vector Storage:**
   - Define `EmbeddingProvider` abstraction.
   - Setup local runtime for `jina-embeddings-v5-text-small`.
   - Wire SQLite vector extension or local vector table.
   - Enqueue `EMBED_DOCUMENT` jobs in `DocumentWorker`.
5. **Step 5 — Hybrid Retrieval, Reranker & ContextBuilder:**
   - Implement `RetrievalService` (FTS5 + Vector candidate merge).
   - Implement `Reranker` abstraction.
   - Implement `ContextBuilder` (deduplication, page ordering, context budget enforcement).
6. **Step 6 — Refactor AnalysisService to consume ContextBuilder:**
   - Connect `AnalysisService` to `ContextBuilder` for targeted analysis, eliminating raw full-document prompt leakage.
7. **Step 7 — Task & Deadline Extraction:**
   - Schema and repository for `tasks`.
   - Deadline precision parser (distinguish `date` vs `time`).
   - Extract tasks from analysis result and persist.
8. **Step 8 — Windows Native Integrations:**
   - Windows Credential Manager via Rust `keyring` crate for persistent `SecretsService`.
   - Windows Notifications via `tauri-plugin-notification`.
   - Windows Calendar adapter via `CalendarService`.
   - Watched folder native filesystem listener.

---

## 9. Next Implementation Task

### Selected Task: **Document Chunking Pipeline (Schema, Repository, ChunkingService & Tests)**

- **Rationale:**
  - `document_chunks` is the fundamental missing data layer between raw text extraction and all semantic capabilities.
  - Without `document_chunks`, neither `EmbeddingProvider`, `Vector Storage`, `SQLite FTS5`, `RetrievalService`, nor `ContextBuilder` can be implemented.
  - It builds directly on the already VERIFIED `document_pages` source-of-truth table without requiring unvetted external dependencies.
  - It directly enables resolving the high-priority architectural defect (ISSUE-H1: `AnalysisService` sending full raw pages to LLM).
- **Scope of Next Task:**
  1. Add `0003_document_chunks.sql` migration and update `src/db/schema.ts` and `src/db/migrator.ts`.
  2. Implement `DocumentChunkRepository`.
  3. Implement `ChunkingService` (deterministic paragraph/page splitting preserving exact page provenance).
  4. Write comprehensive automated test suite `tests/chunking.test.ts`.
  5. Validate against existing test suites to ensure zero regressions.
