import type { NavTabId } from "./Sidebar"
import { Search, FolderSync, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  activeTab: NavTabId
  onNewDocumentClick?: () => void
}

const tabTitles: Record<NavTabId, { title: string; subtitle: string }> = {
  overview: {
    title: "Tổng quan",
    subtitle: "Tình trạng xử lý tài liệu và công việc cần thực hiện",
  },
  documents: {
    title: "Tài liệu",
    subtitle: "Quản lý và theo dõi các tài liệu đã nhập vào hệ thống",
  },
  tasks: {
    title: "Công việc",
    subtitle: "Danh sách nhiệm vụ và thời hạn được trích xuất từ tài liệu",
  },
  settings: {
    title: "Cài đặt",
    subtitle: "Cấu hình thư mục theo dõi, mô hình AI và lưu trữ cục bộ",
  },
}

export function Header({ activeTab, onNewDocumentClick }: HeaderProps) {
  const current = tabTitles[activeTab]

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {current.title}
        </h1>
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          {current.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm kiếm tài liệu, công việc..."
            readOnly
            className="h-8 w-60 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />
        </div>

        {/* Sync / Watcher indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
          <FolderSync className="size-3.5 text-muted-foreground" />
          <span className="text-[11px]">Theo dõi thư mục: Sẵn sàng</span>
        </div>

        {/* New Document Button placeholder */}
        <Button
          size="sm"
          className="gap-1.5 text-xs h-8"
          onClick={onNewDocumentClick}
        >
          <Plus className="size-3.5" />
          <span>Nhập tài liệu</span>
        </Button>
      </div>
    </header>
  )
}
