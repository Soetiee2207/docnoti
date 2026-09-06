# ADR-008 — Background Processing

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti phải xử lý các tác vụ có thể mất thời gian:

- PDF parsing
- OCR
- document analysis
- embedding generation
- retrieval-related indexing
- re-analysis
- batch import
- watched-folder ingestion

Các tác vụ này không được block UI và cần tiếp tục xử lý đáng tin cậy khi
ứng dụng đang chạy.

Một cơ chế queue đơn giản trong memory không đủ vì application có thể bị
restart hoặc crash giữa chừng.

## Decision

docnoti sử dụng **persistent SQLite-backed background worker**.

Queue state được lưu trong SQLite để worker có thể khôi phục công việc sau
restart.

Kiến trúc:

```text
Application
    ↓
Job Repository
    ↓
SQLite processing_jobs
    ↓
Background Worker
    ↓
Processor
    ↓
Domain Service
```

Worker là infrastructure component. Domain services không phụ thuộc vào
worker implementation.

## Job Model

Mỗi background task được biểu diễn bởi một job có tối thiểu:

```text
id
type
status
payload
attempts
max_attempts
created_at
started_at
completed_at
error
```

Các status chính:

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

Job phải có đủ thông tin để worker có thể tiếp tục xử lý sau application
restart.

## Job Types

Các job type được thiết kế theo pipeline hiện tại, ví dụ:

```text
INGEST_DOCUMENT
PROCESS_DOCUMENT
OCR_DOCUMENT
ANALYZE_DOCUMENT
EMBED_DOCUMENT
```

Có thể bổ sung job type mới khi có pipeline capability mới.

## Worker Lifecycle

Worker thực hiện vòng đời:

```text
PENDING
   ↓
Claim
   ↓
PROCESSING
   ↓
Success → COMPLETED
   │
   └── Failure → retry / FAILED
```

Worker phải claim job trước khi xử lý để tránh nhiều worker xử lý cùng một
job.

Job processing phải có tính idempotent ở mức phù hợp với từng processor.

## Retry Policy

Không retry vô hạn.

Mỗi job có bounded retry policy.

```text
Transient Failure
→ Retry
→ Retry limit reached
→ FAILED
```

Các lỗi permanent phải chuyển sang `FAILED` mà không retry không cần thiết.

Ví dụ lỗi permanent:

- invalid input
- missing source file
- unsupported document format
- malformed persisted state

Ví dụ lỗi có thể retry:

- temporary I/O failure
- transient provider failure
- temporary OCR process failure

Retry policy cụ thể thuộc processor/job type, không hard-code một chính sách
duy nhất cho mọi loại job.

## Crash Recovery

Worker phải xử lý job đang ở trạng thái `PROCESSING` khi application bị
crash hoặc bị đóng bất thường.

Khi startup:

```text
PROCESSING jobs
      ↓
Detect stale jobs
      ↓
Requeue or fail according to policy
      ↓
Resume processing
```

Không được coi một job là `COMPLETED` nếu transaction/side effect tương ứng
chưa thực sự hoàn tất.

## Idempotency

Các processor phải tránh tạo duplicate side effects khi job được retry.

Ví dụ:

- duplicate document ingestion được bảo vệ bằng content hash
- analysis version chỉ được tạo khi analysis thành công
- embedding là secondary index và có thể rebuild
- job retry không được tạo duplicate persistent records ngoài contract

Idempotency key hoặc uniqueness constraint nên được dùng khi cần.

## Priority and Ordering

V1 không yêu cầu scheduler phức tạp.

Mặc định worker xử lý job theo thứ tự:

```text
priority
→ created_at
```

Các pipeline dependency phải được tôn trọng.

Ví dụ:

```text
PDF ingestion
→ processing
→ OCR if required
→ analysis
→ embedding
```

Một job không được chạy trước khi prerequisite state đã sẵn sàng.

## Concurrency

V1 ưu tiên reliability hơn throughput.

Worker có thể bắt đầu với concurrency thấp, phù hợp máy người dùng.

Các processor nặng như OCR và embedding phải tránh chiếm toàn bộ tài nguyên
máy.

Concurrency và resource limits có thể được cấu hình sau khi có benchmark
thực tế.

## UI Integration

UI đọc trạng thái từ persisted job/document state.

UI không trực tiếp điều khiển processor.

Ví dụ:

```text
Worker
  ↓
processing_jobs / documents
  ↓
Repository
  ↓
React UI
```

UI có thể:

- hiển thị progress/state
- hiển thị lỗi
- yêu cầu retry
- yêu cầu re-analysis
- cancel job nếu processor hỗ trợ cancellation

## Failure Isolation

Một job thất bại không được làm hỏng toàn bộ queue.

```text
Job A → FAILED
Job B → vẫn có thể chạy
Job C → vẫn có thể chạy
```

Lỗi phải được persist đủ để người dùng hoặc developer có thể xác định
nguyên nhân.

Không nuốt exception và không đánh dấu `COMPLETED` sau khi xử lý thất bại.

## Privacy and Local-First

Queue metadata và processing state được lưu local.

Document data không được đưa ra ngoài hệ thống local chỉ vì job được chạy
background.

Đối với cloud AI:

```text
Background Worker
→ AnalysisService
→ ContextBuilder
→ AIProvider
```

Cloud access vẫn phải tuân thủ cloud opt-in và không được silent fallback.

## Embedding Jobs

Embedding generation chạy qua background worker.

Pipeline:

```text
Document Pages
→ Chunker
→ Document Chunks
→ EMBED_DOCUMENT
→ EmbeddingProvider
→ SQLite Vector Storage
```

Embedding là secondary index.

Nếu embedding job thất bại:

```text
Document vẫn usable
+
FTS5 vẫn usable
+
Embedding job có thể retry/rebuild
```

Embedding failure không được làm document chuyển thành unusable.

## Re-analysis

Re-analysis tạo job mới thay vì sửa trực tiếp job đã hoàn thành.

Mỗi analysis result được version hóa bởi `AnalysisService`.

```text
Existing Analysis
      ↓
User requests re-analysis
      ↓
New ANALYZE_DOCUMENT job
      ↓
New analysis version
```

Không tự động re-analyze vô hạn.

## Watched Folders and Batch Import

Watched-folder ingestion và batch import không được bypass queue.

```text
Watched Folder
      ↓
Ingestion
      ↓
Persistent Job
      ↓
Processing Pipeline
```

Batch import tạo các job độc lập hoặc dependency chain phù hợp thay vì một
job khổng lồ không thể resume.

## Consequences

### Positive

- job survives application restart
- processing không block UI
- retry và failure state rõ ràng
- dễ quan sát pipeline
- phù hợp local-first architecture
- có thể xử lý batch và watched folders
- embedding/OCR/analysis có cùng execution infrastructure

### Negative

- cần quản lý job state và recovery
- cần thiết kế idempotency
- SQLite queue phức tạp hơn in-memory queue
- resource management cần benchmark thực tế

## Alternatives Rejected

### In-memory queue

Rejected vì mất state khi application restart/crash.

### External message broker

Rejected cho V1 vì tăng operational complexity và không phù hợp local-first
desktop application.

### OS-level scheduler cho toàn bộ pipeline

Rejected vì không cung cấp đủ job state, retry và dependency semantics.

## Invariants

1. Background processing không block UI.
2. Job state phải persistent.
3. Không retry vô hạn.
4. `PROCESSING` jobs phải được recovery sau crash/restart.
5. Processor phải idempotent ở mức cần thiết.
6. Một failed job không được làm hỏng toàn bộ queue.
7. Embedding failure không làm document unusable.
8. Re-analysis tạo job mới và analysis version mới.
9. Watched-folder và batch processing phải đi qua persistent queue.
10. Không được đánh dấu `COMPLETED` khi processing chưa thực sự thành công.
