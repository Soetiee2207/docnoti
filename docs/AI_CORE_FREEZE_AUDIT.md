# AI CORE FREEZE AUDIT — DOCNOTI V1

- **Date:** 2026-09-11
- **Auditor:** DeepMind Antigravity AI Engine Auditor
- **Scope:** Complete Reliability & Architecture Freeze Audit of AI Core Components
- **Constraint:** Code Freeze — Audit & Gap Analysis Only (No Source Modification)

---

## 1. Executive Summary & Verification Baseline

Before auditing the 18 core components, the current verification status was confirmed across all regression suites:
- **Internal Test Protocol:** 18/18 PASS (100%)
- **DEF-002 (Middle/Closing task retention):** Verified & Fixed
- **DEF-003 (Long-document sampling blind spot):** Verified & Fixed
- **Q&A Task Isolation:** Verified (0 tasks generated in Q&A mode)
- **Token Budgeting:** Bounded context strictly maintained ($\le 22,400$ characters)
- **Hybrid Retrieval & RRF:** Verified with graceful lexical fallback
- **Real OpenAI & OCR End-to-End:** Verified
- **Cascade Deletion & State Management:** Verified

---

## 2. Component-by-Component Audit (18 Components)

### 1. Document Classification
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Không có lỗi nghiêm trọng. `normalizeClassification()` đã bọc đầy đủ 8 enum types theo SPEC (`UNKNOWN`, `OFFICIAL_DOCUMENT`, `ANNOUNCEMENT`, `PLAN`, `REPORT`, `MEETING_DOCUMENT`, `ASSIGNMENT`, `OTHER`), tự động map các biến thể như `NOTICE` $\rightarrow$ `OFFICIAL_DOCUMENT`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 2. Full Analysis Pipeline
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Pipeline thực hiện tuần tự: Budgeting $\rightarrow$ Bounded Request $\rightarrow$ AIProvider $\rightarrow$ Evidence Validation $\rightarrow$ Analysis Repository Persistence $\rightarrow$ Task Extraction $\rightarrow$ Document State Update. Luồng chạy trơn tru, không có unhandled promise rejection.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 3. Summary Generation
- **STATUS:** `STABLE`
- **QUALITY:** 4.5/5
- **ISSUE:** Bổ sung Rule 9 ("Thorough Inspection of Entire Document") đã giải quyết triệt để hiện tượng attention decay ở phần cuối văn bản. Đối với tài liệu bị lấy mẫu (sampled), hệ thống phát cảnh báo rõ ràng `LARGE_DOCUMENT_SAMPLED`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 4. Task Extraction
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Hỗ trợ 2 tầng trích xuất: ưu tiên mảng `tasks` có cấu trúc từ LLM, fallback qua heuristic `fields` + `evidences`. Đã có cơ chế deduplication signature bằng `${title.toLowerCase()}_${rawDeadline}`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 5. Assignee Extraction
- **STATUS:** `STABLE`
- **QUALITY:** 4/5
- **ISSUE:** Trích xuất chính xác đơn vị/cá nhân khi văn bản nêu rõ (e.g. "Phòng Kế hoạch", "Thư ký"). Nếu văn bản không ghi rõ, LLM trả về `null` thay vì bịa đặt người nhận việc. Khi lưu vào `tasks`, assignee được ghi nhận vào `description: "Người phụ trách: ..."` do bảng `tasks` hiện tại ưu tiên `title` và `description`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Để sau (V2 có thể bổ sung cột chuyên biệt `assignee` trong schema DB nếu người dùng yêu cầu lọc theo người).

### 6. Deadline Extraction & Normalization
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Bộ phân tích `deadlineParser.ts` áp dụng nguyên tắc tất định (deterministic regex), phân định rõ 4 loại: `exact` (chuẩn hóa `YYYY-MM-DD`), `relative` (chứa khoảng thời gian tương đối, `normalizedDate = null`), `ambiguous` (chứa mốc mơ hồ như "cuối tháng", `normalizedDate = null`), và `none`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 7. Evidence Validation & Citation Grounding
- **STATUS:** `STABLE`
- **QUALITY:** 4.5/5
- **ISSUE:** `validateEvidence()` trong `AnalysisService` kiểm tra từng trích dẫn (`sourceText`) đối chiếu với nội dung trang thực tế:
  - Nếu số trang không tồn tại trong context: gắn cảnh báo `EVIDENCE_PAGE_NOT_FOUND`.
  - Nếu trích dẫn không khớp nguyên văn (verbatim): gắn cảnh báo `EVIDENCE_QUOTE_NOT_FOUND` và tự động hạ cấp trạng thái từ `VERIFIED` xuống `UNCERTAIN`.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 8. Anti-Hallucination Guardrails
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Không phát hiện nguy cơ hallucination. Hệ thống có 3 lớp bảo vệ: System Prompt cấm bịa đặt trích dẫn; Trình phân tích deadline cấm sinh ngày giả khi gặp mốc tương đối; Validator tự động hạ cấp xuống `UNCERTAIN` nếu LLM cố tình trích dẫn sai sự thật.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 9. Hybrid FTS5 + Vector Retrieval
- **STATUS:** `STABLE`
- **QUALITY:** 4.5/5
- **ISSUE:** `HybridRetrievalService` thực thi song song tìm kiếm từ khóa FTS5 và tìm kiếm vector tương đồng cosine. Khi vector provider không khả dụng (ví dụ chưa nạp model Jina trên máy sạch), hệ thống kích hoạt cơ chế `isDegraded = true` và fallback mượt mà về 100% kết quả FTS5 mà không bao giờ gây crash ứng dụng.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 10. Reciprocal Rank Fusion (RRF)
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Thuật toán RRF chuẩn ($k=60$) kết hợp điểm số của FTS5 và Vector, tự động deduplicate theo `chunkId`, sắp xếp giảm dần theo `fusedScore`. Khi ở chế độ degraded (chỉ có FTS5), RRF vẫn hoạt động chính xác theo thứ hạng từ khóa.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 11. ContextBuilder
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Gom các chunk kết quả retrieval thành context có giới hạn token nghiêm ngặt, áp dụng page diversity cap (tối đa 4 chunk/trang trong lượt đầu), không bao giờ cắt vụn chunk ở giữa chừng để bảo toàn tính toàn vẹn của trích dẫn.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 12. Long-Document Budgeting Strategy
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Chiến lược 4 tầng (Mandatory Anchors 1..4 & N-2..N, Content Signal Scoring với date & task regex, Dynamic Uniform Grid stride) đã được chứng minh hiệu quả trên cả tài liệu 18 trang (TC-14) và 210 trang (TC-16). Không còn bất kỳ vùng mù cố định nào.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 13. Document Q&A
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Trả lời trực tiếp bằng tiếng Việt, căn cứ độc quyền trên các đoạn trích xuất từ tài liệu, kèm bằng chứng và trích dẫn số trang rõ ràng.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 14. Q&A Task Isolation
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Q&A lưu lịch sử truy vấn với `isActive = 0`, tuyệt đối không ghi đè bản tóm tắt tổng quan của tài liệu, và **không bao giờ gọi `TaskExtractionService`**. Đảm bảo số task sinh ra từ Q&A luôn là 0.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 15. OpenAIProvider
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Tích hợp `gpt-4o-mini`, cấu hình `response_format: { type: "json_object" }`, nhiệt độ `temperature: 0.1` đảm bảo tính tất định cao, quản lý API key an toàn qua Windows Credential Manager.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 16. Token Budgeting & Limits
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Giới hạn token được kiểm soát 3 tầng: `prepareBudgetedSummaryPages` giới hạn 22,400 ký tự; `ContextBuilder` giới hạn 18,200 ký tự cho Q&A; `OpenAIProvider.executeCall` kiểm tra pre-flight gate không vượt quá `HARD_MAX_REQUEST_PROMPT_TOKENS = 15,000 tokens`. Hoàn toàn loại bỏ nguy cơ dính lỗi OpenAI 200,000 TPM limit.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 17. Retry & Error Handling
- **STATUS:** `STABLE`
- **QUALITY:** 4.5/5
- **ISSUE:** Phân biệt rõ lỗi có thể thử lại (transient network, timeout, HTTP 500, RPM 429) và lỗi không thể thử lại (HTTP 401/403 sai key, TPM rate limit overage, lỗi cấu hình). Cơ chế exponential backoff hoạt động chuẩn xác.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

### 18. Analysis Persistence & Versioning
- **STATUS:** `STABLE`
- **QUALITY:** 5/5
- **ISSUE:** Quản lý version tăng dần qua `getNextVersionNumber()`. Bản phân tích tổng quan được đánh dấu `isActive = 1`, các lượt Q&A được lưu với `isActive = 0` phục vụ theo dõi lịch sử truy vấn và kiểm toán token tiêu thụ.
- **IMPACT:** Thấp
- **RECOMMENDATION:** Không cần sửa.

---

## 3. Deep Dive Verification on Core Invariants (A – L)

| Tiêu chí kiểm tra | Kết quả Audit chi tiết | Đánh giá |
| :--- | :--- | :--- |
| **A. Prompt có mâu thuẫn không?** | Cả `QA_SYSTEM_PROMPT` và `FULL_SUMMARY_SYSTEM_PROMPT` đều có chỉ dẫn nhất quán. QA prompt không chứa mảng `tasks` để tránh LLM nhầm lẫn sinh task. Summary prompt có 9 quy tắc chặt chẽ, không có xung đột câu lệnh. | **KHÔNG** |
| **B. Structured output schema có thiếu field?** | Mọi trường trong `AnalysisResult` (TS), `DocumentAnalysisRecord` (DB), và `TaskRecord` (DB) đều ánh xạ tương thích 1:1, có fallback giá trị rỗng an toàn. | **KHÔNG** |
| **C. Evidence có thể trỏ sai source không?** | Đã có `validateResult()` và `validateEvidence()` đối soát văn bản từng trang. Nếu số trang sai hoặc câu trích không nằm trong văn bản, trạng thái lập tức bị hạ cấp xuống `UNCERTAIN` kèm cảnh báo. | **KHÔNG** |
| **D. Deadline có thể hallucinate không?** | `deadlineParser.ts` chỉ parse ngày khi gặp mẫu regex cụ thể của lịch. Mốc tương đối ("5 ngày") và mốc mơ hồ ("cuối tháng") luôn trả về `normalizedDate = null`. | **KHÔNG** |
| **E. Task có thể bị trùng lặp (duplicate)?** | `TaskExtractionService` duy trì `seenSignatures` theo `${title}_${deadline}` loại bỏ hoàn toàn các task trùng lặp trong cùng một lần phân tích. | **KHÔNG** |
| **F. Q&A có làm thay đổi state ngoài ý muốn?** | `analyzeWithRetrieval()` thiết lập `isActive = 0`, không ghi đè active summary và tuyệt đối không kích hoạt `TaskExtractionService`. Task Isolation đạt 100%. | **KHÔNG** |
| **G. Full Analysis có bỏ sót thông tin quan trọng?** | Chiến lược 4 tầng bảo vệ trang đầu/cuối, quét mật độ mốc thời gian và chia lưới đều giúp bắt trọn vẹn nhiệm vụ ở cả trang 18 và trang 105 trong thử nghiệm thực tế. | **KHÔNG** |
| **H. Long-document có khoảng mù (blind spot)?** | Thuật toán bước nhảy lưới động $\text{step} = \frac{N}{\text{gridQuota}}$ bao phủ toàn bộ tài liệu, không còn khoảng cách tĩnh như mốc $0.45 \rightarrow 0.60$ cũ. | **KHÔNG** |
| **I. Token budget có thể vượt giới hạn OpenAI?** | Ba lớp chặn (Char ceiling $\rightarrow$ ContextBuilder $\rightarrow$ Pre-flight gate $\le 15,000$ tokens) đảm bảo payload gửi đi luôn thấp hơn giới hạn tài khoản OpenAI. | **KHÔNG** |
| **J. Retrieval có fallback graceful không?** | `HybridRetrievalService` tự động chuyển sang FTS5 thuần túy khi không có model vector, gắn cảnh báo `RETRIEVAL_DEGRADED` mà không quăng Exception làm đơ UI. | **CÓ FALLBACK TỐT** |
| **K. Mock provider có thể lọt vào production không?** | **LƯU Ý:** Khi mới cài đặt app trên máy sạch mà chưa bật Cloud AI hoặc chưa nhập OpenAI key, `AIProviderSelector` mặc định trả về `MockAIProvider`. Mặc dù UI có thể hiển thị tên mock provider, người dùng phổ thông có thể băn khoăn vì sao tóm tắt chỉ là văn bản mẫu. Cần có thông báo rõ ràng trên UI yêu cầu cấu hình API key. | **CẦN TỐI ƯU NHỎ** |
| **L. Dependency AI có gây ảnh hưởng tới ADR-014?** | OpenAI chạy qua HTTP fetch thuần túy (không phụ thuộc runtime ngoài). Jina embedding không bị bắt buộc bundle trong V1 (FTS5 đảm nhiệm tìm kiếm). Hoàn toàn độc lập và không xung đột với kế hoạch bundle Python của ADR-014. | **KHÔNG XUNG ĐỘT** |

---

## 4. AI Core Freeze Verdict & Action Plan

### AI CORE STATUS:
# **READY TO FREEZE**

---

### Lý do kết luận READY TO FREEZE:
1. Toàn bộ 18/18 ca kiểm thử thực tế (bao gồm các ca phức tạp: scan OCR, bảng biểu, nhiều mốc thời gian, tài liệu dài 88 trang, giáo trình 210 trang, deadline tương đối/điều kiện, tài liệu rỗng) đều đạt kết quả xuất sắc (100% PASS).
2. Các nguyên tắc bất biến về mặt kiến trúc: **Local-first privacy**, **Evidence grounding**, **Anti-hallucination**, **Task Isolation**, và **Bounded Token Context** đều đã được hiện thực hóa bằng mã nguồn tự kiểm chứng (self-validating) với các bài kiểm tra tự động bao phủ toàn diện.
3. Kiến trúc AI Core hoàn toàn tương thích và không tạo ra bất kỳ rào cản kỹ thuật nào cho việc triển khai đóng gói installer theo **ADR-014**.

---

### Đề xuất tối ưu hóa nhỏ (Có thể thực hiện trước hoặc sau khi đóng gói V1):

1. **[Priority 1 - UX Clarification khi chưa có API Key]**: Khi người dùng chưa kích hoạt Cloud AI hoặc chưa cấu hình OpenAI API key, giao diện Ingestion / Document Detail nên hiển thị một banner thông báo trực quan: *"Chưa kích hoạt Cloud AI — Vui lòng cấu hình OpenAI API key trong Cài đặt để sử dụng tính năng Phân tích chuyên sâu"* thay vì tự động chạy Mock Provider trong môi trường production.
2. **[Priority 2 - Exact Character Offsets for Citations]**: Hiện tại `AnalysisCitation` dựa vào đối soát chuỗi `sourceText` trên trang. Trong V2 có thể bổ sung thuật toán xác định chính xác vị trí ký tự (`charStart`, `charEnd`) để hỗ trợ highlight đoạn văn bản trực tiếp trên giao diện xem trước PDF.
