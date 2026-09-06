# ADR-008: Background Processing

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Background document processing and job execution

---

## Context

`docnoti` phải xử lý các tác vụ có thể mất nhiều thời gian:

- PDF parsing;
- text extraction;
- OCR;
- document classification;
- AI analysis;
- task and deadline extraction;
- search indexing.

Các tác vụ này không được block UI.

Hệ thống cũng cần:

- xử lý batch;
- watched folders;
- persistent processing state;
- retry có giới hạn;
- recovery sau application restart;
- xử lý độc lập từng document;
- tránh duplicate processing;
- theo dõi progress và lỗi.

`docnoti` là single-user, single-machine desktop application nên không cần distributed job queue.

---

## Decision

`docnoti` sử dụng **custom persistent background worker backed by SQLite**.

Kiến trúc:

```text
UI
 │
 ▼
Application Service
 │
 ▼
ProcessingJob
 │
 ▼
SQLite
 │
 ▼
Background Worker
 │
 ├── PDF Processing
 ├── OCR
 ├── Classification
 ├── AI Analysis
 └── Search Indexing