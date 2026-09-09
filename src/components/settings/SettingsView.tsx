import { useState } from "react"
import {
  Folder,
  HardDrive,
  Cpu,
  Bell,
  Power,
  Key,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  FileText,
  Database,
  Terminal,
} from "lucide-react"
import { useAutostart } from "@/hooks/useAutostart"
import { useSecrets } from "@/hooks/useSecrets"
import { useAiConfig } from "@/hooks/useAiConfig"
import { useStorageConfig, type StorageDirKey } from "@/hooks/useStorageConfig"

export function SettingsView() {
  const { autostartEnabled, daemonStatus, loading, error, setAutostart } = useAutostart()
  const {
    isConfigured: isApiKeyConfigured,
    loading: secretsLoading,
    error: secretsError,
    saveApiKey,
    deleteApiKey,
  } = useSecrets()
  const {
    cloudEnabled,
    model,
    testingConnection,
    testResult,
    setCloudEnabled,
    testConnection,
  } = useAiConfig()
  const {
    paths,
    loading: storageLoading,
    error: storageError,
    updateDir,
    resetToDefaults,
    selectDirectory,
  } = useStorageConfig()

  const [apiKeyInput, setApiKeyInput] = useState("")
  const [storageFeedback, setStorageFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const handleChangePath = async (key: StorageDirKey, title: string) => {
    try {
      setStorageFeedback(null)
      const selected = await selectDirectory(title)
      if (!selected) return

      await updateDir(key, selected)
      setStorageFeedback({
        type: "success",
        message: key === "database_dir"
          ? "Đã lưu đường dẫn database mới. Hãy khởi động lại ứng dụng để áp dụng."
          : "Đã cập nhật đường dẫn lưu trữ thành công.",
      })
    } catch (e) {
      setStorageFeedback({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const handleResetPath = async (key: StorageDirKey) => {
    try {
      setStorageFeedback(null)
      await updateDir(key, null)
      setStorageFeedback({
        type: "success",
        message: "Đã khôi phục đường dẫn về mặc định.",
      })
    } catch (e) {
      setStorageFeedback({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Windows Autostart & Background Daemon */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Power className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">Khởi động cùng Windows & Chạy ngầm</h2>
              <p className="text-xs text-muted-foreground">Tự động khởi động khi đăng nhập Windows và duy trì chạy ngầm</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="autostart-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer">
              {autostartEnabled ? "Đang bật" : "Đã tắt"}
            </label>
            <input
              id="autostart-toggle"
              type="checkbox"
              className="size-4 cursor-pointer accent-primary rounded border-border"
              checked={autostartEnabled}
              disabled={loading}
              onChange={(e) => void setAutostart(e.target.checked)}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Trạng thái daemon chạy ngầm:</span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className={`inline-block size-2 rounded-full ${daemonStatus?.running ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              {daemonStatus?.running ? "Đang hoạt động" : "Chưa khởi chạy"}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Bộ lập lịch nhắc nhở (ReminderScheduler):</span>
            <span className="text-foreground">
              {daemonStatus?.schedulerActive ? "Sẵn sàng (Startup Recovery hoàn tất)" : "Dừng"}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Xử lý tài liệu ngầm (DocumentWorker):</span>
            <span className="text-foreground">
              {daemonStatus?.workerActive ? "Sẵn sàng (Polling active)" : "Chờ việc"}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Ghi chú: Khi đóng cửa sổ chính (nút X), ứng dụng sẽ tự động thu nhỏ vào khay hệ thống (System Tray) để tiếp tục gửi thông báo và theo dõi nhắc nhở. Nhấp đúp vào biểu tượng khay để mở lại giao diện, hoặc chọn &quot;Thoát docnoti&quot; để dừng hoàn toàn ứng dụng.
        </p>
      </div>

      {/* Local Storage & System Paths Section */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <HardDrive className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">Lưu trữ cục bộ & Đường dẫn hệ thống</h2>
              <p className="text-xs text-muted-foreground">Tùy chỉnh nơi lưu trữ tài liệu, cơ sở dữ liệu SQLite, file tạm OCR và logs</p>
            </div>
          </div>
          {(paths?.isCustomDocumentsDir || paths?.isCustomDatabaseDir || paths?.isCustomTempOcrDir || paths?.isCustomLogDir) && (
            <button
              type="button"
              disabled={storageLoading}
              onClick={async () => {
                try {
                  setStorageFeedback(null)
                  await resetToDefaults()
                  setStorageFeedback({ type: "success", message: "Đã khôi phục toàn bộ đường dẫn về mặc định" })
                } catch (e) {
                  setStorageFeedback({ type: "error", message: e instanceof Error ? e.message : String(e) })
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer"
              title="Khôi phục tất cả đường dẫn về mặc định"
            >
              <RotateCcw className="size-3" />
              <span>Khôi phục mặc định</span>
            </button>
          )}
        </div>

        {storageError && (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {storageError}
          </div>
        )}

        {storageFeedback && (
          <div
            className={`rounded-lg p-3 text-xs border ${
              storageFeedback.type === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}
          >
            {storageFeedback.message}
          </div>
        )}

        <div className="space-y-3">
          {/* 1. Documents Directory */}
          <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="font-medium text-foreground">Thư mục tài liệu PDF đã lưu</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                paths?.isCustomDocumentsDir
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}>
                {paths?.isCustomDocumentsDir ? "Tùy chỉnh" : "Mặc định"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={paths?.documentsDir ?? "Đang tải..."}
                className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none"
                title={paths?.documentsDir}
              />
              <button
                type="button"
                disabled={storageLoading}
                onClick={() => void handleChangePath("documents_dir", "Chọn thư mục lưu tài liệu PDF")}
                className="rounded-md bg-secondary border border-border px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Folder className="size-3.5" />
                <span>Thay đổi</span>
              </button>
              {paths?.isCustomDocumentsDir && (
                <button
                  type="button"
                  disabled={storageLoading}
                  onClick={() => void handleResetPath("documents_dir")}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer shrink-0"
                  title="Khôi phục về mặc định"
                >
                  <RotateCcw className="size-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nơi lưu trữ các file PDF gốc được nhập vào docnoti. Lưu ý: File đã import trước đó sẽ nằm ở thư mục cũ.
            </p>
          </div>

          {/* 2. Database Directory */}
          <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <span className="font-medium text-foreground">Thư mục Cơ sở dữ liệu SQLite (docnoti.db & vectors)</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                paths?.isCustomDatabaseDir
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}>
                {paths?.isCustomDatabaseDir ? "Tùy chỉnh" : "Mặc định"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={paths?.databaseDir ?? "Đang tải..."}
                className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none"
                title={paths?.databaseDir}
              />
              <button
                type="button"
                disabled={storageLoading}
                onClick={() => void handleChangePath("database_dir", "Chọn thư mục lưu cơ sở dữ liệu docnoti.db")}
                className="rounded-md bg-secondary border border-border px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Folder className="size-3.5" />
                <span>Thay đổi</span>
              </button>
              {paths?.isCustomDatabaseDir && (
                <button
                  type="button"
                  disabled={storageLoading}
                  onClick={() => void handleResetPath("database_dir")}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer shrink-0"
                  title="Khôi phục về mặc định"
                >
                  <RotateCcw className="size-3" />
                </button>
              )}
            </div>
            <div className="flex items-start gap-1.5 rounded bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400 border border-amber-500/20">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý quan trọng:</strong> Thay đổi thư mục cơ sở dữ liệu sẽ có hiệu lực sau khi khởi động lại ứng dụng. Dữ liệu từ file database cũ sẽ không tự động di chuyển sang thư mục mới.
              </span>
            </div>
          </div>

          {/* 3. Temp OCR Directory */}
          <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="size-4 text-primary" />
                <span className="font-medium text-foreground">Thư mục file tạm OCR</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                paths?.isCustomTempOcrDir
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}>
                {paths?.isCustomTempOcrDir ? "Tùy chỉnh" : "Mặc định"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={paths?.tempOcrDir ?? "Đang tải..."}
                className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none"
                title={paths?.tempOcrDir}
              />
              <button
                type="button"
                disabled={storageLoading}
                onClick={() => void handleChangePath("temp_ocr_dir", "Chọn thư mục chứa file tạm OCR")}
                className="rounded-md bg-secondary border border-border px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Folder className="size-3.5" />
                <span>Thay đổi</span>
              </button>
              {paths?.isCustomTempOcrDir && (
                <button
                  type="button"
                  disabled={storageLoading}
                  onClick={() => void handleResetPath("temp_ocr_dir")}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer shrink-0"
                  title="Khôi phục về mặc định"
                >
                  <RotateCcw className="size-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nơi lưu các file ảnh phân giải cao tạm thời trong khi PaddleOCR trích xuất chữ viết tay/scan. Tự động dọn dẹp sau khi trích xuất.
            </p>
          </div>

          {/* 4. Logs Directory */}
          <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <span className="font-medium text-foreground">Thư mục nhật ký (Logs)</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                paths?.isCustomLogDir
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}>
                {paths?.isCustomLogDir ? "Tùy chỉnh" : "Mặc định"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={paths?.logDir ?? "Đang tải..."}
                className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none"
                title={paths?.logDir}
              />
              <button
                type="button"
                disabled={storageLoading}
                onClick={() => void handleChangePath("log_dir", "Chọn thư mục lưu log hệ thống")}
                className="rounded-md bg-secondary border border-border px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Folder className="size-3.5" />
                <span>Thay đổi</span>
              </button>
              {paths?.isCustomLogDir && (
                <button
                  type="button"
                  disabled={storageLoading}
                  onClick={() => void handleResetPath("log_dir")}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer shrink-0"
                  title="Khôi phục về mặc định"
                >
                  <RotateCcw className="size-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nơi lưu trữ file log hoạt động của docnoti phục vụ việc theo dõi và gỡ lỗi.
            </p>
          </div>
        </div>
      </div>

      {/* Watched Folders Section */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Folder className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Thư mục theo dõi tự động</h2>
            <p className="text-xs text-muted-foreground">Tự động phát hiện tài liệu mới được lưu về máy</p>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Chưa có thư mục nào được cấu hình theo dõi.
        </div>
      </div>

      {/* AI Processing Mode */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Cpu className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Mô hình phân tích (AI Provider)</h2>
            <p className="text-xs text-muted-foreground">Cấu hình mô hình xử lý văn bản và trích xuất thông tin</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <button
            type="button"
            onClick={() => void setCloudEnabled(false)}
            className={`text-left rounded-lg p-3 space-y-1 transition-all cursor-pointer ${
              !cloudEnabled
                ? "border-2 border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border border-border bg-background hover:bg-muted/30 opacity-75"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Xử lý Cục bộ (Mặc định)</span>
              {!cloudEnabled && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <CheckCircle2 className="size-3" />
                  Đang dùng
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              Không gửi dữ liệu ra internet. Phù hợp tài liệu bảo mật hoặc khi không có API key.
            </p>
          </button>

          <button
            type="button"
            onClick={() => void setCloudEnabled(true)}
            className={`text-left rounded-lg p-3 space-y-1 transition-all cursor-pointer ${
              cloudEnabled
                ? "border-2 border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border border-border bg-background hover:bg-muted/30 opacity-75"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Cloud AI ({model})</span>
              {cloudEnabled && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  Đang bật
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              Hỏi đáp tài liệu thông minh kiểu NotebookLM. Chỉ gửi các đoạn trích cần thiết (Retrieval context).
            </p>
          </button>
        </div>

        {/* OpenAI API Key Management */}
        <div className="rounded-lg border border-border bg-background p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">OpenAI API Key</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium">
                <span className={`inline-block size-2 rounded-full ${isApiKeyConfigured ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                <span className={isApiKeyConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                  {isApiKeyConfigured ? "Đã cấu hình" : "Chưa cấu hình"}
                </span>
              </span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Khóa API được mã hóa và lưu trữ an toàn trong <strong>Windows Credential Manager</strong> của hệ điều hành. Không lưu trữ vào cơ sở dữ liệu SQLite hay hiển thị lại sau khi lưu.
          </p>

          {secretsError && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {secretsError}
            </div>
          )}

          {testResult && (
            <div
              className={`rounded-md p-2 text-xs ${
                testResult.success
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              placeholder={isApiKeyConfigured ? "Nhập khóa mới để thay thế (sk-...)" : "Nhập OpenAI API Key (sk-...)"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={secretsLoading || !apiKeyInput.trim()}
              onClick={async () => {
                try {
                  await saveApiKey(apiKeyInput);
                  setApiKeyInput("");
                } catch {}
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isApiKeyConfigured ? "Cập nhật" : "Lưu khóa"}
            </button>
            {isApiKeyConfigured && (
              <>
                <button
                  type="button"
                  disabled={testingConnection}
                  onClick={() => void testConnection()}
                  className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  title="Kiểm tra kết nối thực tế tới OpenAI"
                >
                  <RefreshCw className={`size-3 ${testingConnection ? "animate-spin" : ""}`} />
                  <span>{testingConnection ? "Đang thử..." : "Kiểm tra kết nối"}</span>
                </button>
                <button
                  type="button"
                  disabled={secretsLoading}
                  onClick={async () => {
                    await deleteApiKey();
                    setApiKeyInput("");
                  }}
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  Xóa khóa
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Bell className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Thông báo Windows</h2>
            <p className="text-xs text-muted-foreground">Hiển thị nhắc nhở công việc và cảnh báo hạn chót</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Thông báo được gửi cục bộ qua hệ thống Native Windows Notification của Tauri.
        </p>
      </div>
    </div>
  )
}
