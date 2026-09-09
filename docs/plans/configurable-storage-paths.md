# Configurable Storage Paths

## Mục tiêu

Cho phép người dùng tùy chỉnh đường dẫn lưu trữ của hệ thống docnoti thông qua
giao diện Cài đặt (Settings). Hiện tại tất cả đường dẫn đều hardcode vào
`app_local_data_dir()` của Tauri và không thể thay đổi.

## Bối cảnh hiện tại

### Các đường dẫn hiện tại (tất cả dẫn xuất từ `app_local_data_dir`)

| Loại dữ liệu | Vị trí mặc định | Nơi quyết định |
|---|---|---|
| **SQLite database** (`docnoti.db`) | `{base_dir}/docnoti.db` | [`lib.rs:51`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/lib.rs#L51) |
| **Tài liệu PDF đã import** | `{base_dir}/documents/` | [`storage.rs:75`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/storage.rs#L75) |
| **File tạm OCR** | `{base_dir}/temp_ocr/` | [`ocr.rs:31`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/ocr.rs#L31) |
| **Tauri log** | Mặc định của `tauri-plugin-log` | [`lib.rs:20-23`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/lib.rs#L20-L23) |
| **Embeddings / Vectors** | Cùng trong SQLite | (không tách file riêng) |

`base_dir` = `%LOCALAPPDATA%/com.tauri.dev/` (Windows)

### Hiện trạng UI Settings

[`SettingsView.tsx`](file:///e:/2026_Document/Idea_soetie/docnoti/src/components/settings/SettingsView.tsx) có section
"Lưu trữ cục bộ" nhưng chỉ hiển thị text tĩnh `data/local_storage`, **không đọc
giá trị thật** và **không cho phép chỉnh sửa**.

### Hiện trạng Settings persistence

[`AppSettingsRepository`](file:///e:/2026_Document/Idea_soetie/docnoti/src/repositories/appSettingsRepository.ts) lưu key-value vào bảng `app_settings` trong SQLite. Đã có `get`, `set`, `getBoolean`, `setBoolean`.

---

## Các đường dẫn cần hỗ trợ tùy chỉnh

| Setting Key | Ý nghĩa | Giá trị mặc định |
|---|---|---|
| `storage.documents_dir` | Thư mục lưu file PDF đã import | `{app_local_data_dir}/documents` |
| `storage.database_dir` | Thư mục chứa file `docnoti.db` | `{app_local_data_dir}` |
| `storage.temp_ocr_dir` | Thư mục tạm cho OCR processing | `{app_local_data_dir}/temp_ocr` |
| `storage.log_dir` | Thư mục chứa log files | `{app_local_data_dir}/logs` |

> [!NOTE]
> Embeddings/vectors hiện nằm trong SQLite (bảng `document_chunk_embeddings`),
> không phải file riêng. Nếu người dùng di chuyển `database_dir` thì vector cũng
> tự động đi theo. Không cần setting riêng cho vector.

---

## Proposed Changes

### 1. Rust — Storage Configuration Module

#### [NEW] `src-tauri/src/storage_config.rs`

Module mới quản lý cấu hình đường dẫn:

- Struct `StorageConfig` giữ các đường dẫn hiện tại.
- Function `load_storage_config(app: &AppHandle) -> StorageConfig`:
  - Đọc file config `storage_config.json` từ `app_local_data_dir`.
  - Nếu file chưa tồn tại hoặc field nào thiếu → dùng giá trị mặc định.
  - Validate mỗi đường dẫn: tồn tại, có quyền ghi, là thư mục.
  - Nếu validation fail → fallback về mặc định + log warning.
- Function `save_storage_config(app: &AppHandle, config: &StorageConfig)`:
  - Ghi `storage_config.json` vào `app_local_data_dir`.
- Function `get_resolved_dir(app: &AppHandle, dir_type: StorageDirType) -> PathBuf`:
  - Trả về đường dẫn đã resolve cho từng loại.
- Tauri commands:
  - `get_storage_config` → trả về toàn bộ config cho UI.
  - `update_storage_dir` → cập nhật một đường dẫn cụ thể (với validation).
  - `get_resolved_paths` → trả về đường dẫn thực tế đang dùng.
  - `browse_directory` → mở native directory picker (sử dụng `tauri-plugin-dialog`).

**Lý do dùng JSON config file riêng thay vì SQLite `app_settings`:**

Database path chính là thứ có thể bị thay đổi. Nếu config nằm trong DB thì khi
user đổi DB path → không đọc lại được config. Config file JSON phải nằm ở vị trí
cố định (`app_local_data_dir`) mà không bao giờ thay đổi.

#### [MODIFY] [`storage.rs`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/storage.rs)

- `get_storage_dir()` → đọc từ `StorageConfig` thay vì hardcode `base_dir.join("documents")`.
- Security guard trong `delete_stored_file` và `read_stored_file` phải kiểm tra
  target path nằm trong **configured** documents dir, không phải hardcode.

#### [MODIFY] [`ocr.rs`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/ocr.rs)

- `run_ocr_on_image()` → đọc `temp_ocr_dir` từ `StorageConfig`.

#### [MODIFY] [`lib.rs`](file:///e:/2026_Document/Idea_soetie/docnoti/src-tauri/src/lib.rs)

- Trong `setup()`:
  - Load `StorageConfig` ngay sau khi có `app_local_data_dir`.
  - Dùng `config.database_dir` để resolve `db_path`.
  - Manage `StorageConfig` vào Tauri state.
  - Cấu hình `tauri-plugin-log` với `config.log_dir`.
- Đăng ký các Tauri commands mới trong `invoke_handler`.

---

### 2. Frontend — Settings UI

#### [MODIFY] [`SettingsView.tsx`](file:///e:/2026_Document/Idea_soetie/docnoti/src/components/settings/SettingsView.tsx)

Thay thế section "Lưu trữ cục bộ" (dòng 88–109) bằng section tương tác:

- Hiển thị mỗi đường dẫn đang cấu hình với giá trị thực tế (đọc từ Tauri command).
- Mỗi đường dẫn có nút "Thay đổi" → mở native directory picker.
- Nút "Khôi phục mặc định" cho mỗi đường dẫn.
- Hiển thị trạng thái: đường dẫn hợp lệ (✓) hay lỗi (✗).
- Warning nếu thay đổi `database_dir` (cần restart app).
- Warning nếu thay đổi `documents_dir` (file đã import sẽ không tự di chuyển).

#### [NEW] `src/hooks/useStorageConfig.ts`

Custom hook gọi các Tauri commands:

- `getStorageConfig()` — load config hiện tại.
- `updateStorageDir(dirType, newPath)` — cập nhật một đường dẫn.
- `browseDirectory()` — mở directory picker.
- State management: loading, error, config value.

---

### 3. Frontend — Storage Service

#### [MODIFY] [`storage.ts`](file:///e:/2026_Document/Idea_soetie/docnoti/src/services/storage.ts)

- `InMemoryStorageService` — không thay đổi (test-only).
- `TauriStorageService` — không thay đổi logic, vì đường dẫn đã được
  resolve ở Rust side. Frontend gọi `import_pdf_file` → Rust tự dùng configured path.

---

## Files KHÔNG ĐƯỢC chỉnh sửa

Các file sau **tuyệt đối không được thay đổi** trong quá trình implement:

| File | Lý do |
|---|---|
| `src/db/schema.ts` | Schema DB không liên quan |
| `src/services/ai/*` | AI pipeline không liên quan |
| `src/services/retrieval/*` | Retrieval không liên quan |
| `src/services/embedding/*` | Embedding không liên quan |
| `src/services/chunking/*` | Chunking không liên quan |
| `src/services/search/*` | Search không liên quan |
| `src/services/tasks/*` | Task pipeline không liên quan |
| `src/services/calendar/*` | Calendar không liên quan |
| `src/services/notification/*` | Notification không liên quan |
| `src/services/secrets/*` | Secrets không liên quan |
| `src/services/ocr/*` (TS side) | OCR TS service không liên quan (path ở Rust side) |
| `src/services/pdf/*` | PDF processing không liên quan |
| `src/services/worker/*` | Worker không liên quan |
| `src/db/migrator.ts` | Migration logic không liên quan |
| `src/db/client.ts` | DB client không liên quan (path ở Rust side) |
| `tests/*` (existing) | Không sửa test hiện tại |
| `scripts/ocr_runner.py` | OCR script không liên quan |

---

## Quy tắc an toàn

### Path Validation (Rust side)

1. **Đường dẫn phải là absolute path** — từ chối relative path.
2. **Đường dẫn phải là thư mục tồn tại** hoặc có thể tạo được.
3. **Đường dẫn phải writable** — test bằng cách tạo temp file rồi xóa.
4. **Không cho phép path traversal** — reject nếu chứa `..`.
5. **Không cho phép system directories** — reject `C:\Windows`, `C:\Program Files`,
   paths quá ngắn (root drive).
6. **Fallback**: nếu configured path không validate → tự động fallback về mặc định
   và log warning, app vẫn khởi động được.

### Data Safety

7. **Không tự động di chuyển dữ liệu** — khi user đổi `documents_dir`, file PDF
   cũ vẫn nằm ở thư mục cũ. UI phải hiển thị warning rõ ràng.
8. **Không tự động di chuyển database** — khi user đổi `database_dir`, app cần
   restart. Database cũ vẫn tồn tại. UI phải cảnh báo.
9. **Config file luôn ở `app_local_data_dir`** — vị trí cố định, không bao giờ
   thay đổi, đảm bảo app luôn tìm được config.
10. **Config file có giá trị mặc định hợp lý** — xóa config file → app hoạt động
    bình thường với đường dẫn mặc định.

### Backward Compatibility

11. **Không breaking change** — nếu không có `storage_config.json`, app hoạt động
    y hệt hiện tại.
12. **Security guard update** — `delete_stored_file` và `read_stored_file` phải
    kiểm tra against configured documents dir, không hardcode.

---

## Ý nghĩa của thay đổi

| Thay đổi | Ý nghĩa |
|---|---|
| Config file JSON riêng | Tách storage config ra khỏi DB, tránh chicken-and-egg khi đổi DB path |
| `StorageConfig` struct | Centralize tất cả đường dẫn vào một nguồn duy nhất, loại bỏ hardcode rải rác |
| Validation layer | Ngăn user vô tình chọn đường dẫn nguy hiểm (system dir, non-writable) |
| Fallback mechanism | App luôn khởi động được ngay cả khi config hỏng |
| UI directory picker | UX thân thiện, tránh user phải gõ path thủ công |
| Warning cho DB/docs dir | Giúp user hiểu rủi ro trước khi thay đổi |

---

## Config File Format

Vị trí: `{app_local_data_dir}/storage_config.json`

```json
{
  "version": 1,
  "documents_dir": "D:/MyDocuments/docnoti/documents",
  "database_dir": "D:/MyDocuments/docnoti",
  "temp_ocr_dir": null,
  "log_dir": null
}
```

- `null` hoặc field thiếu → dùng giá trị mặc định.
- `version` → cho phép migration config format trong tương lai.

---

## Verification Plan

### Automated Tests

#### [NEW] `tests/storageConfig.test.ts`

- Config load khi không có file → trả về defaults.
- Config load khi file tồn tại → đọc đúng giá trị.
- Config load khi file hỏng (invalid JSON) → fallback về defaults.
- Validation: reject relative path.
- Validation: reject system directory.
- Validation: reject non-writable directory.
- Update → ghi file → reload → giá trị đúng.

#### [NEW] `tests/storageConfigUi.test.tsx`

- Settings UI hiển thị đường dẫn thực tế.
- Nút "Thay đổi" trigger directory picker.
- Warning hiển thị khi đổi database_dir.
- "Khôi phục mặc định" reset về giá trị mặc định.

### Manual Verification

- Khởi động app → Settings hiển thị đường dẫn mặc định đúng.
- Đổi documents_dir → import PDF mới → file nằm đúng thư mục mới.
- Đổi database_dir → restart → app dùng DB mới (trống).
- Xóa `storage_config.json` → restart → app hoạt động bình thường.
- Chọn đường dẫn không hợp lệ → UI hiển thị lỗi, không lưu.

---

## Thứ tự implement đề xuất

1. `storage_config.rs` — module core + config load/save + validation.
2. Sửa `lib.rs` — integrate config vào startup + Tauri state.
3. Sửa `storage.rs` — dùng config cho documents dir.
4. Sửa `ocr.rs` — dùng config cho temp_ocr dir.
5. `useStorageConfig.ts` — hook frontend.
6. Sửa `SettingsView.tsx` — UI tương tác.
7. Tests.
