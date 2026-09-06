# ADR-011: Windows Notification

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Windows desktop notifications

---

## Context

`docnoti` cần thông báo cho người dùng về:

- document mới được xử lý;
- processing failure;
- task sắp đến hạn;
- task đến hạn;
- task quá hạn;
- các thông tin cần user attention.

Notification phải hoạt động trong desktop runtime và không được phụ thuộc vào cloud service.

Hệ thống cần hỗ trợ hai ngữ cảnh:

- runtime notification khi application đang chạy;
- startup notification khi application khởi động.

Notification logic phải được tách khỏi domain logic và phải có khả năng thay đổi implementation mà không ảnh hưởng tới các module khác.

---

## Decision

`docnoti` sẽ sử dụng **Windows native desktop notification capability thông qua Tauri 2** làm notification mechanism chính cho V1.

Kiến trúc:

```text
Domain / Application
        ↓
Notification Service
        ↓
NotificationProvider
        ↓
Tauri Notification Capability
        ↓
Windows Notification