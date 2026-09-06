# ADR-009 — Search and Retrieval

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti cần tìm thông tin trong nhiều tài liệu để:

- người dùng tìm kiếm nội dung
- hỗ trợ document analysis
- tìm context liên quan cho AI
- truy xuất evidence
- xử lý targeted analysis trên document dài

Chỉ sử dụng keyword search không đủ tốt cho các truy vấn diễn đạt khác với
source text. Ngược lại, chỉ sử dụng vector search có thể bỏ sót exact terms,
IDs, tên riêng, số hiệu văn bản và các chuỗi đặc biệt.

Vì vậy V1 cần kết hợp lexical retrieval và semantic retrieval.

## Decision

V1 sử dụng **hybrid retrieval**:

```text
                Query
                  │
          ┌───────┴───────┐
          ↓               ↓
       SQLite FTS5    EmbeddingProvider
          │               │
          │               ↓
          │          Query Vector
          │               │
          │               ↓
          │          Vector Search
          │               │
          └───────┬───────┘
                  ↓
          Merge Candidates
                  ↓
               Top-K
                  ↓
              Reranker
                  ↓
          Context Builder
```

FTS5 và vector retrieval chạy song song.

V1 không yêu cầu một thuật toán fusion/ranking tối ưu cuối cùng. Candidate
pool và weighting có thể được benchmark và điều chỉnh sau.

## Search Source of Truth

Source of truth của document content vẫn là:

```text
document_pages
```

Search indexes là secondary indexes.

```text
document_pages
   ├── FTS5 index
   └── document_chunks
          └── embeddings / vector index
```

Mất hoặc rebuild search index không được làm mất source document.

## Chunking

Semantic retrieval sử dụng `document_chunks`.

Chunk được tạo từ page + paragraph/section với provenance:

```text
id
document_id
page_number
chunk_index
content
char_start
char_end
created_at
```

Chunk phải giữ liên kết về document/page để kết quả retrieval có thể truy
ngược source.

Chunking implementation có thể được cải thiện sau khi có benchmark thực tế,
nhưng provenance không được bỏ.

## Full Corpus Embedding

V1 embed toàn bộ document chunks.

```text
PDF / OCR
   ↓
Document Pages
   ↓
Chunker
   ↓
Document Chunks
   ↓
Embedding Queue
   ↓
EmbeddingProvider
   ↓
Vector Storage
```

Embedding generation chạy background và local-only.

Embedding là secondary index:

```text
Embedding failure
→ document vẫn usable
→ FTS5 vẫn usable
→ embedding có thể retry/rebuild
```

## Embedding Model

V1 sử dụng:

```text
jina-embeddings-v5-text-small
```

Model được dùng cho semantic retrieval, không phải LLM analysis.

Embedding được truy cập qua:

```text
EmbeddingProvider
```

không đi qua `AIProvider`.

Model-specific implementation không được lan vào domain search contract.

## Vector Storage

Vector embeddings được lưu trong SQLite cùng với application data thông qua
vector extension.

Conceptual separation:

```text
document_chunks
      │
      └── embeddings
            ├── chunk_id
            ├── model
            ├── dimensions
            └── vector
```

Embedding record phải xác định model và dimensions để có thể rebuild/index lại
khi model thay đổi.

## FTS5

SQLite FTS5 là lexical search engine V1.

FTS5 đặc biệt hữu ích cho:

- exact terms
- tên riêng
- mã số
- số hiệu văn bản
- từ khóa tiếng Việt
- truy vấn mà semantic similarity không đủ chính xác

FTS5 index phải có thể rebuild từ source/chunk data.

## Candidate Retrieval

V1 sử dụng candidate pool ban đầu:

```text
FTS5      → khoảng 20 candidates
Vector    → khoảng 20 candidates
                    ↓
             Merge → ≤40
```

Các con số trên là initial tuning values, không phải invariant của domain.

Candidate retrieval phải hỗ trợ scope filters khi có:

```text
documentId?
documentType?
dateRange?
```

Không được trả về candidate nằm ngoài scope mà application đã yêu cầu.

## Candidate Merge

Kết quả từ FTS5 và vector search được merge trước khi reranking.

Merge phải:

- loại duplicate chunk
- giữ provenance
- giữ nguồn retrieval nếu cần cho debugging/tuning
- không làm mất document/page/chunk identity

V1 không yêu cầu một công thức score fusion cố định.

## Reranking

V1 có `Reranker` abstraction.

```text
FTS5 + Vector
      ↓
Candidate Merge
      ↓
Reranker
      ↓
Top relevant chunks
```

Reranker là một optimization layer.

Nếu reranking thất bại hoặc chưa được bật, hệ thống phải có fallback hợp lệ
sang merged retrieval results thay vì làm document unusable.

Implementation/model cụ thể của reranker không được hard-code vào retrieval
contract.

## Context Builder

Retrieval không trực tiếp gửi kết quả raw tới LLM.

`ContextBuilder` chịu trách nhiệm:

- chọn top relevant chunks
- deduplicate
- group theo document khi cần
- giữ page order khi phù hợp
- preserve provenance
- kiểm tra context budget
- tạo provider-neutral context

Luồng:

```text
Retrieval
   ↓
Top-K
   ↓
ContextBuilder
   ↓
AIProvider
```

AIProvider không biết FTS5, vector extension hoặc reranker implementation.

## Context Strategy

Search/retrieval được dùng theo task.

### Short Document

Nếu toàn bộ nội dung nằm trong context budget:

```text
Document
→ Direct Context
```

không bắt buộc retrieval.

### Targeted Analysis

Với câu hỏi/task cụ thể:

```text
Query
→ FTS5 + Vector
→ Reranker
→ ContextBuilder
→ AIProvider
```

### Long Document

Không giả định một retrieval query duy nhất đại diện cho toàn bộ document.

Full-document analysis sử dụng hierarchical/map-reduce-style processing khi
cần coverage toàn tài liệu.

Retrieval chủ yếu phục vụ targeted context selection.

## Evidence and Provenance

Search result phải giữ provenance đủ để analysis có thể tạo evidence.

Tối thiểu phải xác định được:

```text
document_id
page_number
chunk_id
source content/location
```

Retrieval score không được coi là evidence.

Một chunk được retrieve không đồng nghĩa claim từ chunk đó đã là `VERIFIED`.

Evidence validation thuộc analysis layer.

## Privacy

Search và embedding chạy local.

Không gửi query/document chunks ra cloud chỉ để thực hiện local retrieval.

Khi retrieval được dùng để chuẩn bị context cho Cloud AI:

```text
Local Document
→ Local Retrieval
→ ContextBuilder
→ Authorized Cloud AI
```

Cloud usage vẫn phải tuân thủ AI provider abstraction và cloud opt-in policy.

## Re-indexing and Model Changes

Search indexes phải có khả năng rebuild.

Khi thay đổi embedding model:

```text
Existing Chunks
→ New Embedding Job
→ New Model Embeddings
→ Rebuild / Replace Vector Index
```

Embedding metadata phải cho phép phân biệt các model/index versions cần thiết.

Không được thay đổi source document chỉ vì re-index.

## Performance

V1 ưu tiên correctness và maintainability hơn tối ưu ranking.

Các tham số như:

- FTS candidate count
- vector candidate count
- reranker top-K
- context size

được coi là tunable configuration.

Tối ưu chỉ được thực hiện dựa trên benchmark hoặc usage evidence thực tế.

## Consequences

### Positive

- exact matching và semantic matching bổ trợ nhau
- phù hợp tiếng Việt và tài liệu nhiều loại
- hỗ trợ targeted analysis trên document dài
- provenance được giữ từ retrieval tới AI analysis
- retrieval tách biệt khỏi AI provider
- index có thể rebuild
- embedding failure không làm mất khả năng sử dụng document

### Negative

- pipeline phức tạp hơn FTS5-only
- phải duy trì chunk và embedding index
- cần background compute cho embeddings
- reranking làm tăng latency/compute
- cần benchmark để tuning hybrid ranking

## Alternatives Rejected

### FTS5 only

Rejected vì semantic matching hạn chế khi query và source dùng cách diễn đạt
khác nhau.

### Vector search only

Rejected vì exact terms, IDs, names và numeric identifiers thường cần lexical
matching.

### External vector database

Rejected cho V1 vì tăng operational complexity và không phù hợp local-first
desktop architecture.

### Send document to Cloud AI and let the model search

Rejected vì tăng privacy exposure, cost và không kiểm soát tốt context
selection.

## Invariants

1. `document_pages` là source of truth cho document content.
2. Search indexes là secondary indexes.
3. FTS5 và vector retrieval đều được hỗ trợ trong V1.
4. Embeddings chạy local-only.
5. Embedding không đi qua `AIProvider`.
6. Retrieval result phải giữ provenance về document/page/chunk.
7. Candidate ngoài requested scope không được đưa vào final context.
8. Retrieval không tự biến evidence thành `VERIFIED`.
9. ContextBuilder là boundary giữa retrieval và AIProvider.
10. Search/index failure không được làm mất source document.
11. Search indexes phải có khả năng rebuild.
12. Ranking/tuning parameters có thể thay đổi mà không phá domain contract.
