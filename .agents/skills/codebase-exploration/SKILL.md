---
name: codebase-exploration
description: Kỹ thuật tra cứu và phân tích codebase nâng cao dành cho agent, bao gồm chiến lược tìm kiếm, định vị entrypoint, và bóc tách dependency.
---

# Skill: Codebase Exploration

## Mục đích
Cung cấp kỹ thuật và phương pháp luận cụ thể giúp agent giải mã nhanh một codebase lạ hoặc phức tạp mà không bị lạc hướng hay hallucinate.

## Chiến thuật tra cứu bằng Tool

### 1. Định vị Entry Points & Architecture
- **Tìm file cấu hình gốc**: Luôn bắt đầu từ file cấu hình cao nhất (`package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`).
- **Tìm router / handlers / controllers**:
  - Dùng `grep_search` tìm các khai báo router hoặc endpoints: `router.`, `app.get`, `app.post`, `@Controller`.
- **Dò tìm data models**:
  - Tìm trong `src/models/`, `src/types/`, `src/schemas/` hoặc grep `interface `, `type `, `class .*Model`.

### 2. Truy vết Luồng Gọi (Call Hierarchy)
- **Từ ngoài vào trong**: Bắt đầu từ UI/API Handler -> Service -> Repository/DB -> External SDKs.
- **Tìm nơi sử dụng hàm/biến**:
  - Sử dụng `grep_search` với tên hàm chính xác (`Query: "functionName("`).
  - Kiểm tra xem hàm có được export ra ngoài module không.

### 3. Kiểm tra Hạ tầng Test
- Đọc các scripts trong config (`npm test`, `pytest`, `cargo test`).
- Tìm file test mẫu tương ứng với module cần can thiệp (ví dụ: `tests/**/*.test.*` hoặc `*.spec.*`).
- Xác định môi trường test: Đang dùng mock hay in-memory DB hay test runner nào?

## Checklist Đánh giá Hiện trạng (Investigation Checklist)
Trước khi kết luận việc tìm hiểu, hãy tự trả lời 5 câu hỏi:
1. *File nào là nơi quyết định logic nghiệp vụ chính của tính năng này?*
2. *Dữ liệu đầu vào đi qua những hàm nào trước khi được lưu lại hoặc trả về?*
3. *Đã có hàm nào tương tự giải quyết bài toán này chưa (để tránh tạo duplicate abstraction)?*
4. *Có convention đặt tên, cấu trúc thư mục hoặc mẫu thiết kế nào đang được áp dụng xuyên suốt không?*
5. *Có bất kỳ ràng buộc hoặc side-effect nào ẩn trong utils/middleware không?*

## Các bẫy thường gặp (Pitfalls to Avoid)
- **Đọc toàn bộ file không mục đích**: Chỉ nên đọc lướt cấu trúc hoặc grep trước, sau đó dùng `StartLine/EndLine` của `view_file` để soi đoạn code trọng yếu.
- **Tự bịa đặt dependencies**: Không suy đoán thư viện nào đã được cài đặt; luôn kiểm tra file manifest.
- **Nhầm lẫn giữa Type Definition và Implementation**: Luôn kiểm tra xem file đang đọc là interface/d.ts hay logic thực thi.
