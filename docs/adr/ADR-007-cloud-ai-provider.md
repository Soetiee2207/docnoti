# ADR-007: Cloud AI Provider

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Cloud AI provider for V1

---

## Context

`docnoti` cần cloud AI để thực hiện các tác vụ như:

- document classification;
- summarization;
- structured information extraction;
- task extraction;
- deadline extraction;
- document-specific analysis.

Cloud AI không phải yêu cầu bắt buộc để ứng dụng hoạt động ở mức kiến trúc tổng thể, nhưng là provider chính được hỗ trợ trong V1.

Project yêu cầu:

- người dùng chủ động bật cloud AI;
- người dùng kiểm soát model;
- người dùng kiểm soát chi phí;
- usage phải được ghi nhận;
- không upload tài liệu lên cloud một cách âm thầm;
- không tự động fallback sang cloud;
- provider phải nằm sau `AIProvider` abstraction.

---

## Decision

`docnoti` sẽ sử dụng **OpenAI API** làm cloud AI provider chính cho V1.

Kiến trúc:

```text
Application
    ↓
AI Service
    ↓
AIProvider
    ↓
CloudAIProvider
    ↓
OpenAI API