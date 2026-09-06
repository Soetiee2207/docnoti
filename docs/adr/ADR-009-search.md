# ADR-009: Search

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Local document and task search

---

## Context

`docnoti` cần cung cấp khả năng tìm kiếm local đối với:

- document filename;
- document metadata;
- extracted text;
- OCR text;
- task title;
- task description;
- deadline-related information.

Search phải:

- hoạt động offline;
- không phụ thuộc cloud;
- hỗ trợ tiếng Việt ở mức phù hợp với V1;
- tích hợp với SQLite;
- không yêu cầu vector database;
- không yêu cầu external search server;
- có thể mở rộng trong tương lai.

V1 chưa yêu cầu semantic/vector search hoặc RAG.

---

## Decision

`docnoti` sẽ sử dụng **SQLite FTS5** làm nền tảng full-text search cho V1.

Kiến trúc:

```text
Document / OCR / Task Data
          │
          ▼
     Search Index
          │
          ▼
       SQLite
         FTS5
          │
          ▼
    Search Service
          │
          ▼
           UI