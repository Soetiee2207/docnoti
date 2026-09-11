import React from "react"
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Settings,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
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
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={`shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col justify-between h-screen select-none transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="flex h-14 items-center justify-between px-3.5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-xs">
              <Layers className="size-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
                  docnoti
                </span>
                <span className="text-[10px] text-muted-foreground leading-none">
                  Document Workspace
                </span>
              </div>
            )}
          </div>

          {onToggleCollapse && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
              title="Thu gọn thanh điều hướng"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="p-2 space-y-1">
          {!collapsed && (
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Menu chính
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon
                  className={`size-4 shrink-0 ${
                    isActive ? "text-sidebar-primary" : "text-muted-foreground"
                  }`}
                />
                {!collapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Footer / Status & Expand button */}
      <div className="p-2 border-t border-sidebar-border">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="size-2 rounded-full bg-emerald-500"
              title="Chế độ ngoại tuyến"
            />
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
                title="Mở rộng thanh điều hướng"
              >
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-sidebar-accent/50 p-2 flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Shield className="size-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-sidebar-foreground">
                  Ngoại tuyến
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground truncate">
                Lưu trữ cục bộ
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
