# ADR-003: Local Database

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Local structured data storage

---

## Context

`docnoti` là ứng dụng local-first và phần lớn dữ liệu phải được lưu trữ trên máy người dùng.

Hệ thống cần lưu trữ có cấu trúc cho:

- documents;
- document metadata;
- processing jobs;
- analysis versions;
- extracted information;
- evidence;
- tasks;
- deadlines;
- calendar events;
- notifications;
- AI usage and cost records;
- application configuration;
- processing state;
- search indexes.

Hệ thống cũng cần:

- hoạt động khi không có Internet;
- hỗ trợ transaction;
- đảm bảo dữ liệu tồn tại sau khi application restart;
- hỗ trợ background processing;
- hỗ trợ recovery sau crash;
- hỗ trợ query và filtering;
- hỗ trợ local full-text search;
- tránh yêu cầu database server riêng.

---

## Decision

`docnoti` sẽ sử dụng **SQLite** làm local structured database.

Database sẽ chạy embedded trong desktop application và được lưu trữ trên máy người dùng.

Kiến trúc storage:

```text
┌──────────────────────────────────────┐
│              docnoti                 │
│                                      │
│  Application / Domain                │
│              │                       │
│              ▼                       │
│       Repository / Data Access       │
│              │                       │
│              ▼                       │
│            SQLite                   │
│              │                       │
│              ▼                       │
│       Local Database File            │
└──────────────────────────────────────┘