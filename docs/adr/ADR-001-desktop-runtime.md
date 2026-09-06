# ADR-001: Desktop Runtime

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Desktop application runtime

---

## Context

`docnoti` là một ứng dụng document intelligence chạy chủ yếu trên máy Windows của người dùng.

Ứng dụng cần:

- chạy như một desktop application;
- hoạt động local-first;
- xử lý tài liệu trên máy người dùng;
- có background processing;
- có khả năng theo dõi watched folders;
- có khả năng chạy khi Windows khởi động;
- hiển thị notification trên Windows;
- có thể tích hợp với các khả năng native của Windows;
- lưu trữ dữ liệu cục bộ;
- không yêu cầu người dùng vận hành một server riêng;
- có khả năng đóng gói thành ứng dụng desktop có thể cài đặt.

Kiến trúc cũng cần giữ ranh giới rõ ràng giữa:

- giao diện người dùng;
- application/domain logic;
- background processing;
- local storage;
- native operating-system capabilities.

Một framework desktop phù hợp cần hỗ trợ tốt Windows và cho phép ứng dụng tiếp cận các native capability khi cần, nhưng không nên khiến toàn bộ application logic phụ thuộc vào native implementation.

Các lựa chọn được xem xét gồm:

- Electron;
- Tauri;
- ứng dụng web chạy local server;
- các desktop framework khác.

---

## Decision

`docnoti` sẽ sử dụng **Tauri 2** làm desktop application runtime.

Kiến trúc desktop sẽ được tổ chức theo hướng:

```text
┌──────────────────────────────────────┐
│              Tauri 2                 │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        Frontend Application    │  │
│  │                                │  │
│  │        React + Vite            │  │
│  └────────────────────────────────┘  │
│                  │                   │
│                  │ Tauri IPC         │
│                  ▼                   │
│  ┌────────────────────────────────┐  │
│  │       Native / System Layer    │  │
│  │                                │  │
│  │  - Windows integration         │  │
│  │  - Notifications               │  │
│  │  - Autostart                   │  │
│  │  - File system access          │  │
│  │  - Native capabilities         │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
                  │
                  ▼
        Local application services
        / background processing
        / local storage