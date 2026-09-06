# ADR-006: AI Provider Abstraction

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** AI model/provider integration

---

## Context

`docnoti` sử dụng AI cho:

- document classification;
- document summarization;
- structured information extraction;
- task extraction;
- deadline extraction;
- document-specific analysis.

AI có thể được cung cấp bởi:

- cloud AI providers;
- local AI models;
- nhiều model/provider khác nhau trong tương lai.

Project không được để domain/application logic phụ thuộc trực tiếp vào một AI vendor.

Người dùng cũng phải có khả năng kiểm soát:

- provider;
- model;
- cloud/local mode;
- usage;
- cost;
- giới hạn sử dụng.

---

## Decision

`docnoti` sẽ sử dụng một **AI Provider Abstraction** làm boundary giữa application và AI implementations.

Kiến trúc:

```text
Application / Domain
        │
        ▼
   AI Service
        │
        ▼
   AIProvider
        │
   ┌────┴──────────────┐
   │                   │
   ▼                   ▼
CloudAIProvider   LocalAIProvider
   │                   │
   ▼                   ▼
OpenAI API          Ollama