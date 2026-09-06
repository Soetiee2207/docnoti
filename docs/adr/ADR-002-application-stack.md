# ADR-002: Application Stack

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Frontend and application development stack

---

## Context

`docnoti` cần một application stack phù hợp với:

- desktop-first architecture;
- local-first processing;
- phát triển nhanh;
- UI hiện đại;
- domain/application logic có thể kiểm thử độc lập;
- tích hợp với Tauri 2;
- khả năng mở rộng trong tương lai;
- phù hợp với kiến trúc modular monolith.

Stack cần tránh việc lựa chọn framework chỉ vì nhu cầu web server hoặc cloud deployment, vì `docnoti` là desktop application.

---

## Decision

`docnoti` sử dụng stack chính:

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Desktop Runtime | Tauri 2 |
| Frontend Framework | React |
| Frontend Build Tool | Vite |
| UI Components | shadcn/ui |
| Styling | Tailwind CSS |

Kiến trúc tổng quát:

```text
┌──────────────────────────────────────┐
│              Tauri 2                 │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          React + Vite          │  │
│  │                                │  │
│  │       shadcn/ui + Tailwind     │  │
│  └────────────────────────────────┘  │
│                  │                   │
│                  ▼                   │
│  ┌────────────────────────────────┐  │
│  │       Application Layer        │  │
│  │          TypeScript             │  │
│  └────────────────────────────────┘  │
│                  │                   │
│                  ▼                   │
│  ┌────────────────────────────────┐  │
│  │          Domain Layer          │  │
│  │          TypeScript             │  │
│  └────────────────────────────────┘  │
│                  │                   │
│                  ▼                   │
│       Tauri / Native Boundary
└──────────────────────────────────────┘