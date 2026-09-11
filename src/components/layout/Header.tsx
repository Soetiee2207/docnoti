import type { NavTabId } from "./Sidebar"
import { Search, FolderSync, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme/ThemeToggle"

interface HeaderProps {
  activeTab: NavTabId
  onNewDocumentClick?: () => void
}

const tabTitles: Record<NavTabId, string> = {
  overview: "Tổng quan",
  documents: "Tài liệu",
  tasks: "Công việc",
  settings: "Cài đặt",
}

export function Header({ activeTab, onNewDocumentClick }: HeaderProps) {
  const title = tabTitles[activeTab]

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>Ngoại tuyến</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Search input placeholder */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm kiếm tài liệu, công việc..."
            readOnly
            className="h-8 w-56 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden"
          />
        </div>

        {/* Sync / Watcher indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
          <FolderSync className="size-3.5 text-muted-foreground" />
          <span className="text-[11px]">Theo dõi thư mục</span>
        </div>

        {/* Theme Switcher */}
        <ThemeToggle />

        {/* New Document Button */}
        <Button
          size="sm"
          className="gap-1.5 text-xs h-8 cursor-pointer"
          onClick={onNewDocumentClick}
        >
          <Plus className="size-3.5" />
          <span>Nhập tài liệu</span>
        </Button>
      </div>
    </header>
  )
}
