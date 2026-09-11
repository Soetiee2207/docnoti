# DocNoti — Báo cáo Kết quả Kiểm thử Nội bộ trên Dữ liệu PDF Thực tế
## (Internal Test Execution Report)

**Mã báo cáo:** `DOCNOTI-QA-REP-001`  
**Ngày thực hiện:** 2026-09-11  
**Môi trường thử nghiệm:**
- **Ứng dụng:** DocNoti Release Installed Binary (`%LOCALAPPDATA%\docnoti\app.exe`)
- **Cơ sở dữ liệu:** SQLite WAL tại `D:\tauri\docnoti.db` (Dữ liệu người dùng thực tế được bảo tồn)
- **Hệ điều hành:** Windows 11 x64
- **Python Runtime:** Python 3.11.9 (PaddlePaddle 3.3.1, PaddleOCR 3.7.0)
- **AI Model:** OpenAI `gpt-4o-mini` (API Key lưu trữ an toàn trong Windows Credential Manager)
- **Giao thức áp dụng:** `docs/INTERNAL_TEST_PROTOCOL.md` (Phiên bản 1.0)

---

## 1. Tổng quan Kết quả Kiểm thử

Bộ kiểm thử gồm **18 tệp PDF thực tế** đại diện cho toàn bộ các thể loại tài liệu, độ dài, cấu trúc bảng biểu, văn bản scan ảnh, deadline tương đối, tài liệu không có task và trường hợp tệp lỗi (negative test).

### Bảng tóm tắt chỉ số thực thi

| Chỉ số kiểm thử | Kết quả đạt được | Đánh giá |
| :--- | :---: | :--- |
| **Tổng số ca kiểm thử (Test Cases)** | **18** | Đạt yêu cầu giao thức (tối thiểu 15–20 PDF) |
| **Số ca kiểm thử ĐẠT (PASS)** | **14 / 18** (77.8%) | Đạt tiêu chuẩn cho giai đoạn kiểm thử nội bộ |
| **Số ca kiểm thử KHÔNG ĐẠT (FAIL)** | **4 / 18** (22.2%) | 0 lỗi P0/P1; 3 lỗi P2; 1 lỗi P3 |
| **Tỷ lệ Crash / Panic** | **0% (0 / 18)** | Hệ thống cực kỳ ổn định, giải phóng bộ nhớ tốt |
| **Bảo tồn Dữ liệu Cũ (Data Preservation)** | **100% (PASS)** | Cơ sở dữ liệu và tài liệu gốc không suy chuyển |
| **Tính Cô lập Q&A (Task Isolation)** | **100% (18 / 18 PASS)** | Q&A sinh đúng 0 task trên toàn bộ 18 ca test |
| **Chống ảo giác Deadline (Anti-Hallucination)**| **100% (PASS)** | Không tự bịa ngày tháng; gán nhãn `relative`/`ambiguous` chuẩn |
| **Xóa liên hoàn (Delete Cascade)** | **100% (PASS)** | Xóa sạch bảng liên quan và PDF vật lý, không ảnh hưởng file khác |

---

## 2. Bảng Tổng hợp Kết quả 18 Ca Kiểm thử

| Mã TC | Tên tệp PDF | Số trang | Text / OCR | Phân loại | Số Task | Q&A Task | Thời gian | Kết luận |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **TC-01** | `01_van_ban_hanh_chinh.pdf` | 3 | Text layer | PLAN | 1 task | 0 | 8.0s | **PASS** |
| **TC-02** | `02_ke_hoach_cong_tac.pdf` | 4 | Text layer | PLAN | 3 tasks | 0 | 8.5s | **PASS** |
| **TC-03** | `03_thong_bao_hop.pdf` | 2 | Text layer | ANNOUNCEMENT | 1 task | 0 | 5.2s | **PASS** |
| **TC-04** | `04_cong_van_chi_dao.pdf` | 2 | Text layer | OFFICIAL_DOC | 0 task | 0 | 5.3s | **FAIL** (P2) |
| **TC-05** | `05_bien_ban_hop.pdf` | 3 | Text layer | MEETING_DOC | 1 task | 0 | 7.9s | **PASS** |
| **TC-06** | `06_bang_phan_cong_cong_viec.pdf` | 4 | Text layer | PLAN | 3 tasks | 0 | 7.1s | **PASS** |
| **TC-07** | `07_pdf_scan_ocr.pdf` | 8 | Real OCR | PLAN | 4 tasks | 0 | 16.7s | **PASS** |
| **TC-08** | `08_bao_cao_tai_chinh_bang_bieu.pdf` | 4 | Text layer | REPORT | 1 task | 0 | 7.2s | **PASS** |
| **TC-09** | `09_nhieu_moc_thoi_gian.pdf` | 2 | Text layer | PLAN | 1 task | 0 | 4.6s | **PASS** |
| **TC-10** | `10_tai_lieu_thong_tin_khong_deadline.pdf` | 3 | Text layer | UNKNOWN | 0 task | 0 | 3.8s | **PASS** |
| **TC-11** | `11_quy_chuan_khong_task.pdf` | 3 | Text layer | OFFICIAL_DOC | 0 task | 0 | 6.9s | **PASS** |
| **TC-12** | `12_deadline_tuong_doi.pdf` | 3 | Text layer | PLAN | 2 tasks | 0 | 7.2s | **PASS** |
| **TC-13** | `13_nhieu_nguoi_phu_trach.pdf` | 4 | Text layer | PLAN | 3 tasks | 0 | 8.2s | **PASS** |
| **TC-14** | `14_tai_lieu_trung_binh.pdf` | 18 | Text layer | OFFICIAL_DOC | 0 task | 0 | 2.9s | **FAIL** (P2) |
| **TC-15** | `15_luan_van_88_trang.pdf` | 88 | Text layer | REPORT | 0 task | 0 | 14.0s | **PASS** |
| **TC-16** | `16_giao_trinh_219_trang.pdf` | 210 | Text layer | UNKNOWN | 0 task | 0 | 3.8s | **FAIL** (P2) |
| **TC-17** | `17_deadline_dieu_kien.pdf` | 2 | Text layer | OFFICIAL_DOC | 0 task | 0 | 5.5s | **FAIL** (P3) |
| **TC-18** | `18_file_pdf_rong.pdf` | 0 | Corrupt/0B | UNKNOWN | 0 task | 0 | 0.01s | **PASS** |

---

## 3. Chi tiết Ghi nhận Từng Ca Kiểm thử

### [TC-01] Quyết định Hành chính: `01_van_ban_hanh_chinh.pdf`
- **Quy mô:** 1.188 bytes | 3 trang | 195 ký tự
- **Text & OCR:** Text layer trích xuất tức thì, `needsOcr = false`.
- **Phân loại & Tóm tắt:** Phân loại chuẩn `PLAN`. Tóm tắt chính xác việc ban hành kế hoạch công tác quý 4 năm 2026.
- **Nhiệm vụ trích xuất:** 1 task: *"Giao Phong Ke hoach tong hop nop bao cao"* | Deadline: `2026-10-15` (`exact`).
- **Q&A & Cách ly:** Trả lời chính xác câu hỏi hạn nộp báo cáo. **Số task sinh ra từ Q&A: 0**.
- **Kết luận:** **PASS**

### [TC-02] Kế hoạch Công tác Quý: `02_ke_hoach_cong_tac.pdf`
- **Quy mô:** 1.522 bytes | 4 trang | 288 ký tự
- **Nhiệm vụ trích xuất:** 3 tasks:
  1. *"Hoan thien ke hoach chi tiet"* | Deadline: `2026-11-30` (`exact`)
  2. *"Can doi ngan sach"* | Deadline: `2026-12-15` (`exact`)
  3. *"Tong ket he thong"* | Deadline: `2026-12-31` (`exact`)
- **Q&A & Cách ly:** Hỏi đáp đúng trọng tâm. **Số task sau Q&A: 0**.
- **Kết luận:** **PASS**

### [TC-03] Thông báo Họp Giao ban: `03_thong_bao_hop.pdf`
- **Quy mô:** 968 bytes | 2 trang | 213 ký tự
- **Phân loại:** `ANNOUNCEMENT` (chuẩn xác).
- **Nhiệm vụ trích xuất:** 1 task: chuẩn hóa ngày họp `2026-10-25` (`exact`) từ mốc "09h00 ngày 25/10/2026".
- **Q&A & Cách ly:** Xác nhận phòng họp và mốc giờ. **Số task sau Q&A: 0**.
- **Kết luận:** **PASS**

### [TC-04] Công văn Chỉ đạo Khẩn: `04_cong_van_chi_dao.pdf`
- **Quy mô:** 976 bytes | 2 trang | 127 ký tự
- **Phân loại:** `OFFICIAL_DOCUMENT` (chuẩn xác).
- **Kết quả:** Trích xuất 0 task (Kỳ vọng: 1 task gửi phản hồi trước `10/11/2026`).
- **Lý do:** Mô hình nhận diện công văn có tính chất chỉ đạo chung chung thay vì giao việc cụ thể cho một cá nhân/phòng ban định danh, nên bỏ qua mảng `tasks`.
- **Kết luận:** **FAIL (Mức P2 - Ghi nhận DEFECT-01)**

### [TC-05] Biên bản Cuộc họp: `05_bien_ban_hop.pdf`
- **Quy mô:** 1.134 bytes | 3 trang | 196 ký tự
- **Phân loại:** `MEETING_DOCUMENT` (chuẩn xác).
- **Nhiệm vụ trích xuất:** 1 task: bóc tách chính xác nhiệm vụ trong phần Kết luận: *"Giao Chi Nguyen Thi Lan hoan thien phu luc hop dong"* | Deadline: `2026-11-05` (`exact`). Các ý kiến thảo luận ở phần trên không bị biến thành task giả.
- **Q&A & Cách ly:** **Số task sau Q&A: 0**.
- **Kết luận:** **PASS**

### [TC-06] Bảng Phân công Công việc: `06_bang_phan_cong_cong_viec.pdf`
- **Quy mô:** 1.586 bytes | 4 trang | 289 ký tự
- **Phân loại:** `PLAN`.
- **Nhiệm vụ trích xuất:** 3 tasks từ dạng bảng cột:
  1. *"Kiem tra bao mat he thong"* | Deadline: `2026-10-20` (`exact`)
  2. *"Kiem thu tinh nang thanh toan"* | Deadline: `2026-11-15` (`exact`)
  3. *"Ban giao tai lieu huong dan"* | Deadline: `2026-11-30` (`exact`)
- **Kết luận:** **PASS**

### [TC-07] PDF Scan thuần ảnh: `07_pdf_scan_ocr.pdf`
- **Quy mô:** 745.733 bytes | 8 trang | File scan thực tế
- **OCR:** Kích hoạt PaddleOCR 3.7.0 thực tế, trích xuất thành công nội dung chữ tiếng Việt trên toàn bộ các trang scan. File ảnh tạm trong `D:\tauri\temp_ocr` được xóa sạch (0 file tồn dư).
- **Nhiệm vụ trích xuất:** 4 tasks công tác dân vận với deadline `none` (chính sách xuyên suốt).
- **Kết luận:** **PASS**

### [TC-08] Báo cáo Tài chính Bảng biểu: `08_bao_cao_tai_chinh_bang_bieu.pdf`
- **Quy mô:** 1.584 bytes | 4 trang | 321 ký tự
- **Phân loại:** `REPORT` (chuẩn xác).
- **Nhiệm vụ trích xuất:** 1 task: *"Hoàn tất đối soát chứng từ"* | Deadline: `2026-11-28` (`exact`). Các dòng số liệu ngân sách không bị nhầm lẫn thành deadline.
- **Kết luận:** **PASS**

### [TC-09] Tài liệu Nhiều Mốc Thời gian: `09_nhieu_moc_thoi_gian.pdf`
- **Quy mô:** 1.056 bytes | 2 trang | 206 ký tự
- **Phân loại:** `PLAN`.
- **Nhiệm vụ trích xuất:** Hệ thống phân biệt rõ ràng ngày ban hành (`01/09/2026`), ngày hiệu lực (`15/09/2026`) với hạn chót hành động: trích xuất đúng mốc sơ kết `2026-10-30`.
- **Kết luận:** **PASS**

### [TC-10] Tài liệu Thông tin Không Deadline: `10_tai_lieu_thong_tin_khong_deadline.pdf`
- **Quy mô:** 1.128 bytes | 3 trang | Sổ tay văn hóa doanh nghiệp
- **Chống ảo giác:** Trích xuất đúng **0 task**. Không bịa ra deadline giả.
- **Q&A & Cách ly:** Trả lời đúng các giá trị cốt lõi. **Số task sau Q&A: 0**.
- **Kết luận:** **PASS**

### [TC-11] Quy chuẩn Không chứa Nhiệm vụ: `11_quy_chuan_khong_task.pdf`
- **Quy mô:** 1.182 bytes | 3 trang | Quy chuẩn bảo mật thông tin
- **Chống ảo giác:** Trích xuất đúng **0 task**. Các điều khoản quy định chung không bị ép thành task cá nhân.
- **Kết luận:** **PASS**

### [TC-12] Tài liệu Deadline Tương đối: `12_deadline_tuong_doi.pdf`
- **Quy mô:** 1.154 bytes | 3 trang | Quy trình giải quyết khiếu nại
- **Nhiệm vụ trích xuất:** 2 tasks:
  1. *"Phản hồi cho khách hàng"* | Deadline: `5 ngày làm việc` | Loại: `relative`
  2. *"Gửi báo cáo giải trình"* | Deadline: `cuối tháng` | Loại: `ambiguous`
- **Đặc biệt:** Không tự ý tính toán ngày giả định khi thiếu mốc xuất phát. Bảo toàn nguyên vẹn tính chất tương đối.
- **Kết luận:** **PASS**

### [TC-13] Phân công Đa Đơn vị Phụ trách: `13_nhieu_nguoi_phu_trach.pdf`
- **Quy mô:** 1.572 bytes | 4 trang | 303 ký tự
- **Nhiệm vụ trích xuất:** 3 tasks tách biệt:
  1. *"Ra soat tinh hop phap cac hop dong"* | Deadline: `2026-11-12` (`exact`)
  2. *"Cung cap so sach chung tu"* | Deadline: `2026-11-18` (`exact`)
  3. *"Cung cap ho so lao dong"* | Deadline: `2026-11-22` (`exact`)
- **Kết luận:** **PASS**

### [TC-14] Tài liệu Độ dài Trung bình (18 trang): `14_tai_lieu_trung_binh.pdf`
- **Quy mô:** 6.940 bytes | 18 trang | Quy chế nội bộ
- **Kết quả:** Trích xuất 0 task (Kỳ vọng: 1 task cam kết tuân thủ ở trang 18 hạn `05/12/2026`).
- **Lý do:** Độ tập trung ngữ cảnh của mô hình bị loãng qua 18 trang điều khoản quy chế, dẫn đến việc bỏ sót nghĩa vụ ở trang cuối cùng.
- **Kết luận:** **FAIL (Mức P2 - Ghi nhận DEFECT-02)**

### [TC-15] Luận văn Tốt nghiệp Thực tế (88 trang): `15_luan_van_88_trang.pdf`
- **Quy mô:** 3.231.611 bytes | 88 trang | Chuyên đề SalonHub
- **Ngân sách Token:** Cơ chế `prepareBudgetedSummaryPages()` tự động lấy mẫu các trang đầu, mục lục, nội dung đại diện và trang kết luận. Không bị tràn TPM, không lỗi OpenAI context.
- **Q&A Retrieval:** Tìm kiếm kết hợp (FTS5 + Vector) trích xuất chính xác đoạn mô tả đồ án SalonHub.
- **Kết luận:** **PASS**

### [TC-16] Giáo trình Lớn (210 trang): `16_giao_trinh_219_trang.pdf`
- **Quy mô:** 78.432 bytes | 210 trang | Giáo trình tổng hợp
- **Kết quả:** Tóm tắt hoàn tất không lỗi token. Tuy nhiên task ở trang 105 (hạn nộp tiểu luận `10/11/2026`) bị bỏ sót do nằm ngoài các bước lấy mẫu tóm tắt (0.45 và 0.60 bỏ qua mốc 0.50).
- **Q&A:** Khi đặt câu hỏi trực tiếp, Retrieval tìm thấy đúng đoạn bài tập.
- **Kết luận:** **FAIL (Mức P2 - Ghi nhận DEFECT-03)**

### [TC-17] Deadline Có Điều kiện: `17_deadline_dieu_kien.pdf`
- **Quy mô:** 960 bytes | 2 trang | Hợp đồng dịch vụ
- **Kết quả:** Trích xuất 0 task (Kỳ vọng: 1 task thanh toán đợt 2 kèm điều kiện "sau khi nghiệm thu").
- **Lý do:** Mô hình coi điều khoản thanh toán là cam kết hợp đồng thay vì tác vụ công việc cần tạo lịch nhắc.
- **Kết luận:** **FAIL (Mức P3 - Ghi nhận DEFECT-04)**

### [TC-18] Tệp Rỗng / Corrupt (Negative Test): `18_file_pdf_rong.pdf`
- **Quy mô:** 0 bytes | 0 trang
- **Xử lý ngoại lệ:** Hệ thống bắt lỗi nhẹ nhàng (`Dữ liệu tệp PDF rỗng`), không crash ứng dụng, không làm sập background runner.
- **Kết luận:** **PASS**

---

## 4. Phân tích Chuyên sâu các Phát hiện Trọng yếu

### 4.1. Tài liệu dài & Kiểm soát Ngân sách Token (Token Budgeting)
- Các tài liệu cực lớn (TC-15: 88 trang, TC-16: 210 trang) đã chứng minh thuật toán `prepareBudgetedSummaryPages()` hoạt động hiệu quả trong việc **ngăn chặn lỗi 429 TPM Exceeded hoặc 400 Context Length Exceeded**.
- Toàn bộ 88 trang và 210 trang đều được chunking và embedding đầy đủ vào SQLite.
- Tuy nhiên, việc lấy mẫu để tóm tắt tài liệu >100 trang có thể bỏ lọt các tác vụ nằm sâu ở các chương giữa nếu các chương đó không rơi vào mốc lấy mẫu.

### 4.2. Chống ảo giác Thời gian & Deadline
- DocNoti thể hiện xuất sắc nguyên tắc **không ảo giác**:
  * Các tài liệu thuần thông tin (TC-10, TC-11) không sinh bất kỳ task nào (0 task).
  * Các mốc thời gian tương đối (TC-12: *"5 ngày làm việc"*, *"cuối tháng"*) được giữ nguyên bản chất và gán nhãn `relative` / `ambiguous`, không tự ý biến thành ngày giả mạo.
  * Phân biệt chuẩn xác giữa ngày ban hành văn bản và hạn chót thi hành nhiệm vụ (TC-09).

### 4.3. Tính Cô lập Tác vụ Q&A (Task Isolation)
- **18 / 18 ca kiểm thử đạt tuyệt đối 100% về tính cô lập Q&A**.
- Sau mỗi câu hỏi Q&A, bảng `tasks` trong SQLite được kiểm tra tức thì: số lượng task mới phát sinh luôn là **0**. Điều này đảm bảo triệt để trải nghiệm người dùng không bị rác dữ liệu khi hỏi đáp tự do.

### 4.4. Xóa Liên hoàn & Bảo toàn Dữ liệu (Cascade Integrity)
- Thử nghiệm xóa tài liệu trong quá trình kiểm thử dọn sạch 100% các bảng `documents`, `document_pages`, `document_chunks`, `document_chunk_embeddings`, `fts_documents`, `document_analyses`, `tasks`.
- File vật lý trong `D:\tauri\document` được xóa sạch.
- **Tài liệu gốc của người dùng** (`ke-hoach-thuc-hien-cong-tac-dan-van...`) được đối chiếu liên tục và bảo toàn nguyên vẹn 100% cấu trúc 27 chunks.

---

## 5. Danh mục Khuyết tật & Ghi nhận Lỗi (Defect Log)

### DEFECT-01: Bỏ sót tác vụ trong công văn chỉ đạo khẩn
- **Mã lỗi:** `DEF-001`
- **Mức độ nghiêm trọng:** **P2 (Major)**
- **Tài liệu liên quan:** `TC-04` (`04_cong_van_chi_dao.pdf`)
- **Mô tả:** Văn bản có câu *"Gui van ban phan hoi ve Van phong truoc ngay 10/11/2026 de tong hop"*, nhưng Full Analysis trích xuất 0 task.
- **Nguyên nhân gốc:** Prompt phân loại `OFFICIAL_DOCUMENT` coi trọng việc tóm tắt nội dung chỉ đạo chung của văn bản hơn là bóc tách hành động gửi phản hồi khi văn bản không nêu đích danh tên một cá nhân cụ thể.
- **Thành phần ảnh hưởng:** `src/services/ai/openAiProvider.ts` (`FULL_SUMMARY_SYSTEM_PROMPT`).
- **Hướng xử lý:** Bổ sung chỉ dẫn trong system prompt: *"Đối với văn bản chỉ đạo/yêu cầu phản hồi trước một ngày cụ thể, bắt buộc trích xuất thành task ngay cả khi đối tượng thực hiện là tập thể/các đơn vị"*.

---

### DEFECT-02: Pha loãng ngữ cảnh làm sót tác vụ ở trang cuối tài liệu trung bình (18 trang)
- **Mã lỗi:** `DEF-002`
- **Mức độ nghiêm trọng:** **P2 (Major)**
- **Tài liệu liên quan:** `TC-14` (`14_tai_lieu_trung_binh.pdf`)
- **Mô tả:** Tài liệu 18 trang điều khoản quy chế, trang 18 có hạn nộp cam kết `05/12/2026` nhưng kết quả trích xuất 0 task.
- **Nguyên nhân gốc:** 17 trang trước đó là các quy định lý thuyết thuần túy làm loãng sự chú ý (attention weight) của mô hình ngôn ngữ đối với câu lệnh ngắn ở trang cuối cùng.
- **Thành phần ảnh hưởng:** `src/services/ai/analysisService.ts` / Prompting.
- **Hướng xử lý:** Tối ưu hóa cấu trúc prompt trích xuất task thành 2 phase độc lập: Phase 1 tạo bản tóm tắt, Phase 2 quét chuyên sâu các câu chứa mốc thời gian và từ khóa hành động (`nộp`, `báo cáo`, `hoàn thành`).

---

### DEFECT-03: Cơ chế lấy mẫu trang của tài liệu >200 trang bỏ qua task ở giữa tài liệu
- **Mã lỗi:** `DEF-003`
- **Mức độ nghiêm trọng:** **P2 (Major)**
- **Tài liệu liên quan:** `TC-16` (`16_giao_trinh_219_trang.pdf`)
- **Mô tả:** Tác vụ nộp bài tập ở trang 105 bị bỏ sót trong Full Analysis (tuy nhiên Q&A tìm kiếm bằng Retrieval vẫn trả lời đúng).
- **Nguyên nhân gốc:** Hàm `prepareBudgetedSummaryPages()` lấy mẫu theo các bước `[0.15, 0.3, 0.45, 0.6, 0.75, 0.9]`. Mốc 0.50 rơi vào khoảng trống giữa 0.45 và 0.60 nên trang 105 không có mặt trong ngữ cảnh tóm tắt.
- **Thành phần ảnh hưởng:** `src/services/ai/analysisService.ts` (`prepareBudgetedSummaryPages`).
- **Hướng xử lý:** Thêm mốc lấy mẫu `0.50` (chính giữa tài liệu) vào mảng tỷ lệ lấy mẫu hoặc sử dụng FTS5 quét các trang có từ khóa deadline đưa vào danh sách trang ưu tiên trước khi lấy mẫu phân tán.

---

### DEFECT-04: Điều khoản thanh toán có điều kiện chưa được nhận diện thành Task
- **Mã lỗi:** `DEF-004`
- **Mức độ nghiêm trọng:** **P3 (Minor)**
- **Tài liệu liên quan:** `TC-17` (`17_deadline_dieu_kien.pdf`)
- **Mô tả:** Điều khoản *"Dot 2 thanh toan 30% gia tri hop dong se duoc thuc hien sau khi hai ben ky bien ban nghiem thu dat yeu cau"* không được trích xuất thành task `conditional`.
- **Nguyên nhân gốc:** Mô hình xem đây là thỏa thuận pháp lý của hợp đồng thay vì một đầu việc hành chính thông thường.
- **Thành phần ảnh hưởng:** `src/services/tasks/taskExtractionService.ts`.
- **Hướng xử lý:** Cải thiện regex và keyword nhận diện các nghĩa vụ thanh toán hợp đồng gắn với điều kiện nghiệm thu.

---

## 6. Phân loại Khuyết tật & Đánh giá Sẵn sàng Phát hành

### 6.1. Bảng phân loại mức độ lỗi
- **Lỗi P0 (Blocker):** **0 lỗi** (Không có lỗi sập ứng dụng, mất dữ liệu hay lỗi bảo mật nào).
- **Lỗi P1 (Critical):** **0 lỗi** (Không có hiện tượng ảo giác nghiêm trọng hay rò rỉ dữ liệu).
- **Lỗi P2 (Major):** **3 lỗi** (DEF-001, DEF-002, DEF-003: cần tinh chỉnh prompt và thuật toán lấy mẫu trang).
- **Lỗi P3 (Minor):** **1 lỗi** (DEF-004: nhận diện điều khoản hợp đồng điều kiện).

---

### 6.2. Kết luận Xếp loại: RELEASE READINESS

**XẾP LOẠI: INTERNAL TEST CONTINUE (Tiếp tục Kiểm thử Nội bộ)**

* **Lý do xếp loại:**
  1. Ứng dụng đã chứng minh **độ tin cậy kiến trúc vượt trội**: 0% crash, kết nối cơ sở dữ liệu hoàn hảo, bảo tồn 100% dữ liệu người dùng, cô lập Q&A tuyệt đối (18/18), dọn dẹp OCR sạch sẽ, xử lý tệp hỏng mượt mà.
  2. Không có bất kỳ lỗi nào ở cấp độ **P0** hoặc **P1**.
  3. Tuy nhiên, tỷ lệ trích xuất task đạt 14/18 (77.8%), với 3 lỗi P2 liên quan đến việc bỏ sót task ở tài liệu công văn không nêu đích danh người và tài liệu dài bị pha loãng ngữ cảnh.
  4. Hệ thống **rất an toàn và sẵn sàng cho các đợt kiểm thử nội bộ tiếp theo**. Trước khi chuyển sang trạng thái *CANDIDATE FOR REAL USER*, nhóm phát triển cần thực hiện tinh chỉnh nhỏ đối với prompt phân tích và bổ sung bước quét trước các trang chứa deadline cho tài liệu dài theo các giải pháp đã ghi nhận trong mục 5.
