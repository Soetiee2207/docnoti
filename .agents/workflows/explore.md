---
description:  Khám phá codebase, thu thập chứng cứ hiện trạng mà không sửa đổi file, tạo tiền đề cho phase Plan.
---

# Workflow: Explore
## Mục tiêu
Thu thập đầy đủ chứng cứ kỹ thuật về hiện trạng của repository để chuẩn bị dữ liệu đầu vào cho `/plan`.
## Điều kiện & Giới hạn
- KHÔNG chỉnh sửa bất kỳ file mã nguồn nào.
- KHÔNG suy diễn hoặc giả định những thứ không có chứng cứ trong code.
- Kích hoạt skill `codebase-exploration` khi cần kỹ thuật dò tìm chi tiết.
## Các bước thực hiện
1. **Khảo sát tài liệu & cấu hình**: Đọc `AGENTS.md`, `.agents/rules/`, `package.json` (hoặc config tương đương) và `docs/`.
2. **Xác định ranh giới & Entrypoints**: Dùng `list_dir` / `grep_search` để định vị điểm vào của luồng nghiệp vụ liên quan đến yêu cầu.
3. **Truy vết luồng dữ liệu & Phụ thuộc**: Phân tích các imports, caller/callee, và cách dữ liệu di chuyển.
4. **Kiểm tra hiện trạng Test & Validation**: Xác định test suite hiện có, lệnh chạy và độ phủ liên quan.
5. **Tổng hợp báo cáo bàn giao**.
## Hợp đồng Đầu ra (Bàn giao cho /plan)
Báo cáo khám phá PHẢI có cấu trúc sau:
### 1. Hiện trạng (Current State)
- Mô tả hành vi hiện tại kèm đường dẫn file cụ thể (`file:///...#Lxx-Lyy`).
- Entrypoints và các modules liên quan trực tiếp.
### 2. Phụ thuộc & Ranh giới (Dependencies & Boundaries)
- Thư viện nội bộ và bên thứ ba đang được dùng.
- Ranh giới kiến trúc cần bảo toàn.
### 3. Hiện trạng Kiểm thử (Test Baseline)
- Lệnh chạy test hiện hữu.
- Các ca kiểm thử đã có / còn thiếu.
### 4. Rủi ro & Điểm chưa rõ (Risks & Unknowns)
- Các rủi ro tiềm ẩn (side-effects, breaking changes).
- Các câu hỏi cần làm rõ trước khi lập kế hoạch.
