import { Folder, HardDrive, Cpu, Bell } from "lucide-react"

export function SettingsView() {
  return (
    <div className="max-w-3xl space-y-6">
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
