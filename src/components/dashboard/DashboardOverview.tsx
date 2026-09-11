import React from "react"
import {
  FileText,
  Clock,
  CheckSquare,
  ArrowUpRight,
  FileCheck2,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDocuments } from "@/hooks/useDocuments"
import { useTasks } from "@/hooks/useTasks"
import type { DocumentRecord } from "@/db/schema"

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  badgeColor?: string
}

function MetricCard({ title, value, icon: Icon, badgeColor }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={`flex size-8 items-center justify-center rounded-lg ${badgeColor || "bg-secondary text-secondary-foreground"}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2">
        <div className="text-2xl font-semibold tracking-tight text-card-foreground">{value}</div>
      </div>
    </div>
  )
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return "Vừa xong"
    if (diffMin < 60) return `${diffMin} phút trước`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} giờ trước`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays} ngày trước`
  } catch {
    return isoString
  }
}

export function DashboardOverview({
  onNavigateToDocuments,
  onNavigateToTasks,
}: {
  onNavigateToDocuments?: () => void
  onNavigateToTasks?: () => void
}) {
  const { documents } = useDocuments()
  const { tasks, pendingCount, loading: loadingTasks } = useTasks()

  const processingCount = documents.filter(
    (d) => d.status === "imported" || d.status === "processing"
  ).length
  const recentDocs = documents.slice(0, 5)
  const pendingTasks = tasks.filter((t) => t.status === "pending")
  const displayTasks = (pendingTasks.length > 0 ? pendingTasks : tasks).slice(0, 5)

  return (
    <div className="space-y-6">
      {/* 3 Streamlined Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          title="Tổng số tài liệu"
          value={documents.length}
          icon={FileText}
        />
        <MetricCard
          title="Đang xử lý"
          value={processingCount}
          icon={Clock}
          badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <MetricCard
          title="Công việc cần xử lý"
          value={pendingCount}
          icon={CheckSquare}
          badgeColor="bg-primary/10 text-primary"
        />
      </div>

      {/* Main Grid: Recent Activity & Pending Tasks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity Table (2 columns on large screens) */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between pb-4">
            <h3 className="text-sm font-semibold text-card-foreground">Hoạt động gần đây</h3>
            {onNavigateToDocuments && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={onNavigateToDocuments}
              >
                Xem tất cả
                <ArrowUpRight className="ml-1 size-3" />
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            {recentDocs.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Chưa có tài liệu nào được nhập.{" "}
                {onNavigateToDocuments && (
                  <button
                    onClick={onNavigateToDocuments}
                    className="text-primary hover:underline font-medium ml-1"
                  >
                    Nhập tài liệu ngay
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 font-medium">Tài liệu</th>
                    <th className="pb-2 font-medium">Định dạng</th>
                    <th className="pb-2 font-medium">Trạng thái</th>
                    <th className="pb-2 font-medium">Nhiệm vụ</th>
                    <th className="pb-2 text-right font-medium">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentDocs.map((doc: DocumentRecord) => (
                    <tr key={doc.id} className="group hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 pr-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[220px]" title={doc.name}>
                            {doc.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground uppercase">PDF</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            doc.status === "processed"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : doc.status === "processing"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : doc.status === "failed"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {doc.status === "processed"
                            ? "Đã xử lý"
                            : doc.status === "processing"
                            ? "Đang xử lý"
                            : doc.status === "failed"
                            ? "Thất bại"
                            : "Chờ xử lý"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">—</td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {formatRelativeTime(doc.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pending Tasks Sidebar in Dashboard (1 column) */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4">
              <h3 className="text-sm font-semibold text-card-foreground">Công việc cần xử lý</h3>
              {onNavigateToTasks && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onNavigateToTasks}
                >
                  Chi tiết
                </Button>
              )}
            </div>

            {loadingTasks ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Loader2 className="mx-auto mb-1.5 size-4 animate-spin text-muted-foreground" />
                <span>Đang tải danh sách công việc...</span>
              </div>
            ) : displayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground space-y-2">
                <CheckSquare className="size-6 text-muted-foreground/40" />
                <p className="font-medium text-foreground">Chưa có công việc cần xử lý</p>
                <p className="text-[11px] max-w-[200px]">
                  Các nhiệm vụ và hạn chót sẽ tự động hiển thị tại đây khi bạn phân tích tài liệu.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border bg-background/50 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-foreground line-clamp-2">
                        {task.title}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          task.status === "pending"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : task.status === "confirmed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {task.status === "pending"
                          ? "Chờ xác nhận"
                          : task.status === "confirmed"
                          ? "Đã xác nhận"
                          : task.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {task.deadlineDate || task.rawDeadline || "Không có hạn chót"}
                      </span>
                      <span className="truncate max-w-[120px]" title={documents.find((d) => d.id === task.documentId)?.name}>
                        {documents.find((d) => d.id === task.documentId)?.name || "Tài liệu"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
