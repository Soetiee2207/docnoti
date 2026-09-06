# ADR-004: PDF Processing

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** PDF ingestion, text extraction, and document normalization

---

## Context

PDF là định dạng tài liệu bắt buộc phải hỗ trợ trong V1 của `docnoti`.

PDF đầu vào có thể thuộc nhiều dạng:

- PDF có text layer;
- PDF scan;
- PDF chứa hình ảnh;
- PDF có text extraction kém chất lượng;
- PDF nhiều trang;
- PDF có layout phức tạp.

Hệ thống cần:

- đọc PDF local;
- xác định số trang và metadata;
- trích xuất text;
- xác định khi nào text extraction không đủ;
- chuyển tài liệu sang OCR khi cần;
- giữ được thông tin page/source để phục vụ evidence;
- hỗ trợ batch processing;
- không làm mất file gốc;
- xử lý lỗi mà không làm hỏng toàn bộ processing pipeline.

PDF processing phải được tách khỏi AI analysis.

AI không được trực tiếp chịu trách nhiệm đọc file PDF binary.

---

## Decision

`docnoti` sử dụng **PDF.js** làm thư viện PDF processing và text extraction chính trong V1.

PDF processing được thiết kế thành một abstraction riêng:

```text
PDF File
   │
   ▼
PDF Processor
   │
   ├── Validate PDF
   ├── Read Metadata
   ├── Detect Pages
   ├── Extract Text
   └── Evaluate Extraction Quality
             │
             ├── Sufficient
             │      ↓
             │   Normalize Text
             │
             └── Insufficient
                    ↓
                   OCR