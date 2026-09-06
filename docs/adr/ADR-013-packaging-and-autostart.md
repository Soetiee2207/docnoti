# ADR-013 — Packaging and Auto-start

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti là desktop application local-first chạy trên Windows. Ứng dụng cần
được đóng gói để người dùng có thể cài đặt và sử dụng như một ứng dụng
desktop bình thường.

Một số chức năng, đặc biệt watched folders, background processing và
notifications, cần application runtime hoạt động mà không yêu cầu người dùng
mở UI thủ công mỗi lần đăng nhập Windows.

Vì vậy V1 cần:

- Windows installer/package
- bundled frontend + Tauri application
- persistent local data location
- optional auto-start
- khả năng upgrade mà không làm mất application data

## Decision

V1 sử dụng:

```text
Tauri 2
+
Tauri Bundler
+
Windows installer
+
Windows autostart
```

Application code không được phụ thuộc vào installer implementation.

Conceptual structure:

```text
Source
  ↓
Build
  ↓
Tauri Bundle
  ↓
Windows Installer
  ↓
Installed Application
```

## Installation

Installer phải cài:

- desktop application
- required runtime/application assets
- native binaries/resources cần thiết cho V1

Installer không được đặt user documents hoặc application database vào
directory của source/build artifact.

## Application Data

Runtime data phải nằm trong application data directory phù hợp với Windows,
tách khỏi installation directory.

Ví dụ:

```text
Installation
→ Application binaries/resources

App Data
→ SQLite database
→ managed documents
→ search indexes
→ embeddings
→ processing state
→ application logs
```

Điều này cho phép update application mà không xóa dữ liệu người dùng.

## Managed Documents

Documents được ingestion phải nằm trong managed local storage, không phụ
thuộc installation directory.

Database chỉ giữ metadata/path/reference cần thiết theo storage contract.

Uninstall/update không được vô tình xóa managed documents nếu product policy
không yêu cầu hành vi đó.

## Auto-start

V1 hỗ trợ Windows auto-start.

Auto-start dùng để khởi động application runtime/background capabilities,
không có nghĩa UI phải luôn hiện trên màn hình.

Conceptual flow:

```text
Windows Login
      ↓
Auto-start
      ↓
docnoti Runtime
      ↓
Background Worker
      ↓
Watched Folders / Notifications
```

Exact startup behavior, như mở cửa sổ hay chạy minimized/tray, thuộc
application UX configuration.

## Auto-start Policy

Auto-start phải:

- do người dùng kiểm soát
- có thể bật/tắt
- không tự bật ngoài policy đã công bố
- không tạo process duplicate nếu application đã chạy

Nếu auto-start disabled, application vẫn hoạt động bình thường khi người dùng
mở thủ công.

## Background Runtime

Auto-start không thay thế persistent worker design.

```text
Auto-start
    ↓
Application Runtime
    ↓
Persistent SQLite Worker
```

Worker vẫn sử dụng `processing_jobs` và recovery mechanism đã quyết định trong
ADR-008.

## Watched Folders

Watched-folder processing cần runtime hoạt động.

Khi auto-start được bật:

```text
Windows Login
→ docnoti starts
→ watcher initializes
→ new files enter ingestion pipeline
```

Watcher không được xử lý document trực tiếp ngoài ingestion/processing
pipeline.

## Notifications

Auto-start giúp notification scheduler/runtime phục hồi sau Windows login.

```text
Windows Login
→ Runtime starts
→ Notification schedules restored
→ Future reminders become active
```

Notification logic vẫn tuân thủ ADR-011.

## Updates

Application update phải bảo toàn:

- SQLite database
- managed documents
- processing state cần thiết
- search indexes khi tương thích
- embeddings khi tương thích
- user settings
- stored credentials

Nếu schema/index migration cần thiết, migration phải được thực hiện theo
application migration policy.

## Database Migration

Update không được giả định database là disposable.

Startup/update flow:

```text
Application starts
→ Check schema version
→ Run required migrations
→ Validate database
→ Start normal runtime
```

Migration failure phải được báo rõ ràng và không được âm thầm reset database.

## Secrets

Secrets được lưu trong OS Credential Store theo ADR-012.

Installer/update không được:

- export API keys
- copy secrets vào installation files
- reset credentials không có lý do
- ghi secrets vào logs

## Build Artifacts

Build artifacts và installer packages không được chứa:

- user documents
- SQLite runtime database
- embeddings
- API keys
- private test fixtures nếu không cần thiết
- runtime logs

Test fixtures chỉ được bundle nếu thực sự cần cho application behavior và
không chứa dữ liệu riêng tư.

## Uninstall

Uninstall behavior phải phân biệt:

```text
Application
≠
User Data
```

Installer removal không mặc định được coi là permission để xóa toàn bộ managed
documents hoặc database.

Nếu product cung cấp tùy chọn xóa user data, hành vi đó phải explicit và được
giải thích cho người dùng.

## Recovery

Nếu application update hoặc startup thất bại:

- source documents phải còn nguyên
- database không được reset âm thầm
- processing jobs phải giữ state/recovery information
- logs phải đủ để chẩn đoán lỗi nhưng không chứa secrets

## Security

Installer và packaged application phải sử dụng các cơ chế signing/security
phù hợp với release process.

Không đưa arbitrary executable hoặc dependency không được kiểm soát vào
package.

Dependency/runtime changes phải được review trước release.

## V1 Scope

V1 tập trung vào:

- Tauri 2 Windows packaging
- Tauri Bundler
- Windows installer
- local application data separation
- optional Windows auto-start
- startup recovery
- update-safe persistent data
- migration-safe database startup

Advanced enterprise deployment, centralized fleet management và cross-platform
packaging không thuộc scope V1.

## Consequences

### Positive

- cài đặt như Windows desktop application
- data sống độc lập với application binaries
- auto-start hỗ trợ watched folders và notifications
- update an toàn hơn
- phù hợp local-first architecture

### Negative

- packaging/release pipeline phức tạp hơn development build
- cần kiểm thử installer/update/uninstall
- Windows-specific startup behavior cần xử lý
- migration và backward compatibility phải được duy trì

## Alternatives Rejected

### Portable-only application

Rejected vì không cung cấp installation/update/auto-start experience phù hợp
với V1.

### User data trong installation directory

Rejected vì dễ mất dữ liệu khi update/uninstall và gây vấn đề permission.

### Auto-start bắt buộc

Rejected vì người dùng phải kiểm soát behavior của desktop application.

### External service để chạy background

Rejected vì không phù hợp local-first desktop architecture.

## Invariants

1. Installation directory và user data directory phải tách biệt.
2. Update không được xóa user data.
3. Installer không chứa secrets hoặc runtime private data.
4. Auto-start là user-controlled.
5. Auto-start không tạo duplicate runtime.
6. Watched folders và notifications vẫn đi qua application runtime hiện tại.
7. Background processing tiếp tục dùng persistent worker architecture.
8. Database migration không được âm thầm reset database.
9. Uninstall không mặc định xóa user data.
10. Managed documents phải tồn tại độc lập với application binaries.
