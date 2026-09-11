# Fix: File Drag & Drop không hoạt động trong Tauri

## Vấn đề

Người dùng không thể kéo thả file PDF vào vùng drop zone trên màn hình Tài liệu.

### Root Cause

Tauri 2 có cơ chế intercept file-drop ở **native OS level** khi `dragDropEnabled: true`
(mặc định). Khi đó:

- Tauri bắt sự kiện trước khi trình duyệt/WebView nhận được.
- Sự kiện HTML5 `onDrop` vẫn được gọi, nhưng `e.dataTransfer.files` **trả về rỗng**.
- Không có đường dẫn tuyệt đối nào được truyền vào hàm `importFilePaths`.

### Bằng chứng trong code hiện tại

[`DocumentsView.tsx:131-139`](file:///e:/2026_Document/Idea_soetie/docnoti/src/components/documents/DocumentsView.tsx#L131-L139):

```ts
const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  setIsDragOver(false)
  const files = Array.from(e.dataTransfer.files)
  if (files.length === 0) return   // ← LUÔN xảy ra trong Tauri vì files = []

  const paths = files.map((f) => (f as unknown as { path?: string }).path || f.name)
  await importFilePaths(paths)
}
```

**Giải pháp đúng**: Dùng `getCurrentWebview().onDragDropEvent()` từ `@tauri-apps/api/webview` để nhận file paths từ Tauri's native file-drop event system.

---

## API cần sử dụng (`@tauri-apps/api` v2.11.1 — đã có trong project)

```ts
import { getCurrentWebview } from '@tauri-apps/api/webview'

const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'drop') {
    // event.payload.paths: string[] — đường dẫn tuyệt đối thực sự
    console.log(event.payload.paths)
  } else if (event.payload.type === 'enter') {
    // Hiển thị drag-over UI
  } else if (event.payload.type === 'leave' || event.payload.type === 'over') {
    // Ẩn drag-over UI
  }
})
// Gọi unlisten() khi component unmount
```

---

## Phạm vi thay đổi

### File ĐƯỢC sửa

| File | Thay đổi |
|---|---|
| [`src/hooks/useDocuments.ts`](file:///e:/2026_Document/Idea_soetie/docnoti/src/hooks/useDocuments.ts) | Thêm `setupDragDropListener()` — hàm đăng ký `onDragDropEvent` và trả về `unlisten` để cleanup |
| [`src/components/documents/DocumentsView.tsx`](file:///e:/2026_Document/Idea_soetie/docnoti/src/components/documents/DocumentsView.tsx) | Gọi `setupDragDropListener` trong `useEffect`, cleanup khi unmount; xóa hoặc giữ nguyên HTML5 `onDrop` handler (chỉ làm nhiệm vụ hiện UI, không import file) |

### File KHÔNG được sửa

- `src-tauri/tauri.conf.json` — **Không được đặt `dragDropEnabled: false`**. Nếu tắt, Tauri sẽ không còn gửi sự kiện `onDragDropEvent` về frontend.
- `src-tauri/src/*.rs` — Rust layer không liên quan.
- Toàn bộ database, AI, task, calendar, reminders.

---

## Chi tiết triển khai

### 1. `useDocuments.ts`

Thêm function `setupDragDropListener` được expose từ hook:

```ts
import { getCurrentWebview } from '@tauri-apps/api/webview'

// Trong hook body:
const setupDragDropListener = useCallback(
  (
    onEnter: () => void,
    onLeave: () => void,
  ) => {
    if (!isTauriEnvironment()) return () => {}  // no-op trong browser/test

    let cancelled = false
    let unlistenFn: (() => void) | null = null

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (cancelled) return
        const { type } = event.payload
        if (type === 'enter') {
          onEnter()
        } else if (type === 'leave') {
          onLeave()
        } else if (type === 'drop') {
          onLeave()
          const paths = (event.payload as { paths: string[] }).paths
          if (paths && paths.length > 0) {
            await importFilePaths(paths)
          }
        }
      })
      .then((fn) => { unlistenFn = fn })
      .catch(console.error)

    return () => {
      cancelled = true
      unlistenFn?.()
    }
  },
  [importFilePaths]
)
```

Hook trả thêm `setupDragDropListener`.

### 2. `DocumentsView.tsx`

```tsx
// Đăng ký listener khi component mount, cleanup khi unmount
useEffect(() => {
  const cleanup = setupDragDropListener(
    () => setIsDragOver(true),    // khi file enter window
    () => setIsDragOver(false),   // khi file leave hoặc drop xong
  )
  return cleanup
}, [setupDragDropListener])

// HTML5 handler: CHỈ quản lý UI drag-over state, KHÔNG import file nữa
const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  setIsDragOver(true)
}

const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  setIsDragOver(false)
}

// Xóa handleDrop cũ (không còn hoạt động trong Tauri)
```

---

## Quy tắc an toàn

1. **`isTauriEnvironment()` gate** — `setupDragDropListener` phải kiểm tra môi trường. Trong browser/vitest, trả về no-op `() => {}` để test vẫn pass.
2. **Cleanup bắt buộc** — `unlisten()` phải được gọi khi component unmount để tránh memory leak và duplicate listeners.
3. **Idempotency** — Mỗi lần mount component chỉ được đăng ký **một** listener. Không được đăng ký nhiều lần nếu component re-render.
4. **Cancelled flag** — Nếu `onDragDropEvent` promise resolve sau khi cleanup đã được gọi, `cancelled` flag ngăn chặn việc xử lý sự kiện stale.
5. **Filter file type** — Sau khi nhận `paths`, lọc chỉ lấy `.pdf` trước khi gọi `importFilePaths`. Validation cuối vẫn ở Rust layer.

---

## Verification Plan

### Automated Tests

Không cần viết test mới cho native Tauri event — `setupDragDropListener` có `isTauriEnvironment()` gate nên trong vitest nó là no-op. Test hiện tại không bị ảnh hưởng.

Chạy `npx vitest run` xác nhận 0 regression.

### Manual Verification trong Tauri Dev

1. Khởi động `npm run tauri dev`.
2. Mở Windows Explorer → tìm một file PDF bất kỳ.
3. Kéo file PDF vào vùng drop zone của app.
4. **Expected**: Drop zone đổi màu highlight (UI enter), sau khi thả, file được import, danh sách cập nhật.
5. Kéo file thả ra ngoài vùng drop zone.
6. **Expected**: Drop zone trở về trạng thái mặc định (UI leave), không import.
7. Kéo file không phải PDF → **Expected**: Không import (bị reject ở ingestionService).
