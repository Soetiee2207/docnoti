import { useState } from "react"
import { Folder, HardDrive, Cpu, Bell, Power, Key, CheckCircle2, RefreshCw } from "lucide-react"
import { useAutostart } from "@/hooks/useAutostart"
import { useSecrets } from "@/hooks/useSecrets"
import { useAiConfig } from "@/hooks/useAiConfig"

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
  const [apiKeyInput, setApiKeyInput] = useState("")

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

      {/* Local Storage Section */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <HardDrive className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Lưu trữ cục bộ</h2>
            <p className="text-xs text-muted-foreground">Tất cả tài liệu và cơ sở dữ liệu được lưu trên máy của bạn</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-1.5">
          <div className="flex justify-between text-muted-foreground">
            <span>Thư mục dữ liệu:</span>
            <code className="text-foreground font-mono">data/local_storage</code>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Cơ sở dữ liệu:</span>
            <span className="text-foreground">SQLite (Local-first)</span>
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
