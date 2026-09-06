# ADR-012 — Secrets Storage

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti có thể sử dụng credential cho các dịch vụ bên ngoài, đặc biệt là
Cloud AI trong V1.

API key và secret không được lưu trong:

- source code
- SQLite application database
- document metadata
- analysis result
- logs
- Git repository

Ứng dụng chạy local-first trên Windows nên cần sử dụng cơ chế credential
storage của hệ điều hành.

## Decision

V1 sử dụng:

```text
Windows Credential Manager / OS Credential Store
```

thông qua một abstraction:

```text
SecretsService
```

Application code không truy cập trực tiếp Windows Credential Manager.

```text
Application
    ↓
SecretsService
    ↓
OS Credential Store
```

## Secret Boundary

Các service cần credential chỉ gọi `SecretsService`.

Ví dụ:

```text
OpenAIProvider
      ↓
SecretsService
      ↓
Windows Credential Manager
```

Provider không tự quản lý persistence của secret.

## Secret Types

V1 có thể lưu các secret như:

```text
OPENAI_API_KEY
```

Các provider khác trong tương lai có thể có secret riêng.

Secret identifier phải là stable application-defined key, không phụ thuộc vào
raw provider SDK object.

## Storage Requirements

Secret storage phải:

- dùng OS-protected storage
- không lưu plaintext trong SQLite
- không lưu plaintext trong project files
- không commit vào Git
- không xuất hiện trong logs
- không xuất hiện trong error message
- không được đưa vào AI prompt/context

## Access Policy

Chỉ service thực sự cần credential mới được đọc secret.

Application không nên load toàn bộ secret store vào memory.

Conceptual flow:

```text
Operation starts
      ↓
Provider requests required secret
      ↓
SecretsService reads credential
      ↓
Provider uses credential
      ↓
Credential discarded when no longer needed
```

## Configuration

Các non-secret configuration có thể nằm trong application settings, ví dụ:

```text
cloudEnabled
provider
model
timeout
usage limits
```

API key không thuộc application configuration thông thường.

Phải phân biệt rõ:

```text
Configuration
≠
Secret
```

## Cloud AI

Cloud AI là opt-in.

Khi `OpenAIProvider` được sử dụng:

```text
cloudEnabled = true
+
OPENAI_API_KEY available
```

Provider có thể thực hiện request.

Nếu credential thiếu hoặc không hợp lệ:

```text
Missing / Invalid Secret
→ explicit error
→ no silent fallback
```

Không tự động chuyển sang provider khác hoặc tự bật cloud.

## UI and Credential Management

UI có thể cho phép người dùng:

- nhập API key
- thay đổi API key
- xóa API key
- kiểm tra configuration status

UI không được đọc hoặc hiển thị lại plaintext secret sau khi lưu.

Nên hiển thị trạng thái dạng:

```text
API key: Configured
```

thay vì giá trị thực.

## Logging

Không log:

- API key
- access token
- refresh token
- authorization header
- request header chứa secret
- raw credential payload

Error sanitization phải được áp dụng trước khi đưa provider errors vào
application logs hoặc UI.

## Memory Handling

Ứng dụng nên giữ secret trong memory trong thời gian ngắn nhất hợp lý.

Không lưu secret vào:

- global state
- React state lâu dài
- persisted settings
- job payload
- processing job error
- analytics/telemetry

Background job chỉ lưu reference/config identifier nếu cần, không lưu secret.

## Background Worker

Background worker không được copy secret vào job payload.

Ví dụ đúng:

```text
Job
├── type: ANALYZE_DOCUMENT
└── provider: openai
```

Provider lấy credential tại execution time:

```text
Worker
→ AnalysisService
→ OpenAIProvider
→ SecretsService
→ OS Credential Store
```

Điều này cũng cho phép người dùng thay đổi credential mà không phải rewrite
các pending jobs.

## Failure Handling

SecretsService phải phân biệt tối thiểu:

```text
NOT_CONFIGURED
ACCESS_DENIED
STORAGE_ERROR
```

Provider có thể map các trạng thái này thành domain/application error phù hợp.

Không retry vô hạn cho lỗi credential.

Ví dụ:

```text
Missing API key
→ fail immediately

Credential store temporarily unavailable
→ retry according to operation policy
```

## Portability

Abstraction không được đặt tên hoặc thiết kế chỉ để phục vụ Windows ở domain
layer.

Conceptual interface:

```text
SecretsService
├── getSecret(key)
├── setSecret(key, value)
└── deleteSecret(key)
```

V1 implementation:

```text
WindowsCredentialStore
```

Future platforms có thể có implementation khác mà không thay đổi application
logic.

## Privacy

Secrets là dữ liệu nhạy cảm và phải được coi là local-only.

Không gửi secrets tới:

- Cloud AI
- telemetry
- crash reporting
- analytics
- document processing pipeline

Secret chỉ được dùng để authenticate request tới provider tương ứng.

## Consequences

### Positive

- API key được bảo vệ bởi OS
- không nằm trong SQLite/document data
- giảm nguy cơ commit secret vào Git
- provider code đơn giản hơn
- dễ thay đổi credential
- phù hợp local-first architecture

### Negative

- phụ thuộc OS credential facility ở implementation layer
- cần xử lý access/storage errors
- portability cần adapter riêng trên platform khác

## Alternatives Rejected

### Plaintext config file

Rejected vì dễ bị đọc, backup hoặc commit nhầm.

### SQLite application database

Rejected vì database chứa nhiều application data và không phải secret store
được thiết kế chuyên biệt.

### Environment variable làm storage chính

Rejected cho desktop UX vì không thuận tiện cho user configuration và không
phải persistent OS credential management.

### Hard-code API key

Rejected hoàn toàn.

## V1 Scope

V1 tập trung vào:

- Windows Credential Manager / OS Credential Store
- `SecretsService` abstraction
- OpenAI API key
- secure set/get/delete
- sanitized logging
- explicit missing-credential errors
- no secret in job payloads or persisted application data

## Invariants

1. Secret không được lưu plaintext trong SQLite.
2. Secret không được commit vào source control.
3. Secret không được ghi vào logs.
4. Secret không được đưa vào job payload.
5. Secret không được đưa vào document/analysis context.
6. Provider lấy credential thông qua `SecretsService`.
7. Cloud không tự bật khi credential tồn tại.
8. Missing credential không được silent fallback.
9. UI không hiển thị plaintext secret sau khi lưu.
10. Domain/application logic không phụ thuộc trực tiếp Windows Credential
    Manager.
