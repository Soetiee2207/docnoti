# ADR-006 — AI Provider Abstraction

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti sử dụng AI cho:

- document classification
- summarization
- structured information extraction
- task extraction
- deadline extraction
- document-specific analysis

AI provider/model có thể thay đổi theo thời gian. Product không được phụ
thuộc chặt vào một vendor hoặc một model.

Ngoài ra, AI analysis phải làm việc cùng với local retrieval/context
selection để tránh gửi toàn bộ document lên cloud khi không cần thiết.

## Decision

docnoti sử dụng abstraction:

```text
AIProvider
```

Application/domain services chỉ phụ thuộc vào `AIProvider`, không phụ thuộc
trực tiếp vào SDK hoặc API của một AI vendor.

Baseline V1:

```text
AIProvider
└── CloudAIProvider
    └── OpenAI
```

Architecture phải cho phép bổ sung provider khác mà không thay đổi domain
logic.

## AI Analysis Boundary

AIProvider nhận một analysis request đã được chuẩn bị bởi application layer.

Luồng chuẩn:

```text
Document
→ Pages
→ Chunks
→ Context Strategy
→ Context Builder
→ AIProvider
→ Candidate Analysis
→ Evidence Validation
→ Final Analysis
```

AIProvider không chịu trách nhiệm:

- document ingestion
- PDF processing
- OCR
- chunking
- retrieval
- vector search
- reranking
- evidence validation
- task scheduling
- calendar side effects

## Context Policy

AIProvider không mặc định nhận toàn bộ document.

Application layer quyết định context strategy:

```text
Short Document
→ Direct Context

Targeted Analysis
→ FTS5 + Vector Retrieval
→ Reranking
→ Context Builder
→ AIProvider

Long Document
→ Hierarchical Processing
→ AIProvider
```

Khi cloud AI được bật, ưu tiên gửi relevant context thay vì full document.

AIProvider không được tự ý mở rộng context hoặc truy cập source document
ngoài context được application layer cung cấp.

## Cloud AI

Cloud AI là opt-in.

V1 sử dụng OpenAI API làm cloud provider baseline.

Provider phải:

- nhận credentials thông qua `SecretsService`
- không lưu plaintext API key
- trả về structured analysis result
- trả về token usage khi provider cung cấp
- phân loại lỗi retryable/permanent
- sử dụng bounded retry cho lỗi retryable
- không tự động chuyển sang provider khác
- không silent fallback khi cloud bị lỗi

## Provider Contract

Conceptual contract:

```text
AIProvider
├── analyze(request)
└── isAvailable()
```

`analyze()` phải nhận đủ context cần thiết cho analysis và trả về structured
result theo domain contract.

Provider-specific response phải được chuyển đổi về domain-neutral result
trước khi application layer xử lý.

## Evidence Boundary

AIProvider có thể trả về candidate claims và candidate evidence.

Evidence chưa được coi là verified tại provider boundary.

Validation được thực hiện bởi:

```text
AnalysisService
→ EvidenceValidator
```

Quy tắc:

```text
Candidate Claim
→ Evidence Validation
→ VERIFIED / INFERRED / UNCERTAIN
```

Provider không được quyết định cuối cùng rằng một claim là `VERIFIED` nếu
claim chưa được kiểm tra với source document.

## Usage and Cost

AIProvider nên trả usage information khi provider cung cấp, ví dụ:

- input tokens
- output tokens
- total tokens
- provider-specific usage metadata

Cost calculation thuộc application/configuration layer, không hard-code vào
domain logic của provider.

Cloud usage phải chịu các policy về:

- user opt-in
- usage limits
- context budget
- bounded retry
- re-analysis policy

## Error Policy

Các lỗi được chia thành:

### Non-retryable

- missing configuration
- authentication failure
- authorization failure
- malformed request
- invalid provider response

### Retryable

- timeout
- temporary network failure
- rate limit
- transient server error

Retry phải bounded.

Provider không được retry vô hạn.

## Privacy

AIProvider chỉ được nhận dữ liệu mà application layer cho phép.

Đối với Cloud AI:

```text
Local Document
→ Local Retrieval
→ Relevant Context
→ Cloud AI
```

Không có hidden upload path.

Embedding là capability riêng và không sử dụng `AIProvider`.

Embedding phải chạy local-only thông qua:

```text
EmbeddingProvider
```

## Relationship with Retrieval

Retrieval không thuộc `AIProvider`.

Kiến trúc:

```text
RetrievalService
├── FTS5
├── Vector Search
├── Candidate Merge
└── Reranker
        ↓
ContextBuilder
        ↓
AIProvider
```

Điều này cho phép thay đổi retrieval/embedding/reranker mà không thay đổi
AI provider.

## Relationship with Analysis Versioning

`AnalysisService` chịu trách nhiệm:

- gọi AIProvider
- validate result
- validate evidence
- persist analysis
- tạo analysis version
- xử lý warnings
- lưu usage

AIProvider không tự persist analysis versions.

## Consequences

### Positive

- tránh vendor lock-in
- dễ thay đổi model/provider
- test dễ hơn bằng mock provider
- retrieval được tách khỏi AI provider
- cloud privacy boundary rõ ràng
- hỗ trợ future local AI provider
- provider-specific SDK không lan vào domain

### Negative

- cần thêm abstraction và mapping layer
- provider implementations phải tuân thủ domain contract
- một số provider-specific capabilities có thể cần extension metadata

## V1 Implementation

V1 triển khai:

```text
AIProvider
└── OpenAIProvider
```

Mock provider được giữ cho automated tests.

Không bắt buộc local AI provider trong V1.

## Non-goals

ADR này không quyết định:

- embedding model
- vector database
- retrieval algorithm
- reranker model
- chunking algorithm
- long-document algorithm
- calendar integration
- OCR provider

Các quyết định đó thuộc boundary/ADR tương ứng.

## Invariants

1. Domain logic không phụ thuộc trực tiếp vào OpenAI SDK.
2. AIProvider không truy cập document storage trực tiếp.
3. AIProvider chỉ nhận context do application layer cung cấp.
4. Cloud AI không được silent fallback.
5. Evidence phải được validate ngoài provider.
6. Embedding không đi qua AIProvider.
7. Analysis versioning thuộc AnalysisService/repository layer.
8. Provider-specific implementation không được làm thay đổi source-of-truth
   model.
