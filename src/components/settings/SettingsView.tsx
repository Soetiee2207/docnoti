import { Folder, HardDrive, Cpu, Bell, Power } from "lucide-react"
import { useAutostart } from "@/hooks/useAutostart"

export function SettingsView() {
  const { autostartEnabled, daemonStatus, loading, error, setAutostart } = useAutostart()

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
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-3 space-y-1">
            <div className="font-semibold text-foreground">Xử lý hoàn toàn Cục bộ (Mặc định)</div>
            <p className="text-muted-foreground text-[11px]">Không gửi văn bản ra ngoài internet. Bảo mật tối đa dữ liệu người dùng.</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 space-y-1 opacity-70">
            <div className="font-semibold text-foreground">Cloud AI (Tùy chọn)</div>
            <p className="text-muted-foreground text-[11px]">Chỉ kích hoạt khi người dùng cấu hình API Key cá nhân.</p>
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
