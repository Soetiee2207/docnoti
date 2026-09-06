import React from "react"
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Settings,
  Shield,
  Layers,
} from "lucide-react"

export type NavTabId = "overview" | "documents" | "tasks" | "settings"

interface NavItem {
  id: NavTabId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
  },
  {
    id: "documents",
    label: "Tài liệu",
    icon: FileText,
  },
  {
    id: "tasks",
    label: "Công việc",
    icon: CheckSquare,
  },
  {
    id: "settings",
    label: "Cài đặt",
    icon: Settings,
  },
]

interface SidebarProps {
  activeTab: NavTabId
  onSelectTab: (tab: NavTabId) => void
}

export function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col justify-between h-screen select-none">
      {/* Brand Header */}
      <div>
        <div className="flex h-14 items-center gap-2.5 px-5 border-b border-sidebar-border">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-xs">
            <Layers className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              docnoti
            </span>
            <span className="text-[10px] text-muted-foreground leading-none">
              Local Document Intelligence
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1">
          <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Menu chính
          </div>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className={`size-4 ${isActive ? "text-sidebar-primary" : "text-muted-foreground"}`} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Footer / Status Indicator */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="rounded-lg bg-sidebar-accent/50 p-2.5 flex items-center gap-2.5">
          <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Shield className="size-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-sidebar-foreground">Chế độ Ngoại tuyến</span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate">Dữ liệu lưu trữ cục bộ</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
