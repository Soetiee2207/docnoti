import React from "react"
import {
  FileText,
  Clock,
  CheckSquare,
  HardDrive,
  ArrowUpRight,
  AlertCircle,
  FileCheck2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDocuments } from "@/hooks/useDocuments"
import type { DocumentRecord } from "@/db/schema"

interface MetricCardProps {
  title: string
  value: string | number
  subtext: string
  icon: React.ComponentType<{ className?: string }>
  badgeColor?: string
}

function MetricCard({ title, value, subtext, icon: Icon, badgeColor }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={`flex size-8 items-center justify-center rounded-lg ${badgeColor || "bg-secondary text-secondary-foreground"}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-card-foreground">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
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

const mockPendingTasks = [
  {
    id: "task-1",
    title: "Thanh toán tiền thuê văn phòng đợt 3",
    dueDate: "10/09/2026",
    sourceDoc: "Hop_dong_thue_van_phong_2026.pdf",
    priority: "Cao",
  },
  {
    id: "task-2",
    title: "Gửi biên bản đối soát cho đối tác",
    dueDate: "12/09/2026",
    sourceDoc: "Bien_ban_nghiem_thu_giai_doan_1.docx",
    priority: "Trung bình",
  },
  {
    id: "task-3",
    title: "Nộp tờ khai thuế GTGT quý 3",
    dueDate: "20/09/2026",
    sourceDoc: "Thong_bao_nop_thue_Q3_2026.pdf",
    priority: "Cao",
  },
]

export function DashboardOverview({
  onNavigateToDocuments,
  onNavigateToTasks,
}: {
  onNavigateToDocuments?: () => void
  onNavigateToTasks?: () => void
}) {
  const { documents } = useDocuments()

  const processingCount = documents.filter(
    (d) => d.status === "imported" || d.status === "processing"
  ).length
  const recentDocs = documents.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Tổng số tài liệu"
          value={documents.length}
          subtext={`${documents.length} tài liệu trong cơ sở dữ liệu`}
          icon={FileText}
        />
        <MetricCard
          title="Đang chờ / Đang xử lý"
          value={processingCount}
          subtext={processingCount > 0 ? `${processingCount} tài liệu trong hàng đợi` : "Không có hàng đợi"}
          icon={Clock}
          badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <MetricCard
          title="Công việc cần xử lý"
          value="0"
          subtext="Chờ worker phân tích công việc"
          icon={CheckSquare}
          badgeColor="bg-primary/10 text-primary"
        />
        <MetricCard
          title="Chế độ bảo mật"
          value="100% Cục bộ"
          subtext="Không gửi dữ liệu ra ngoài"
          icon={HardDrive}
          badgeColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Main Grid: Recent Activity & Pending Tasks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity Table (2 columns on large screens) */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">Hoạt động gần đây</h3>
              <p className="text-xs text-muted-foreground">Tài liệu vừa được nhập hoặc cập nhật xử lý</p>
            </div>
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
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">Công việc cần xử lý</h3>
                <p className="text-xs text-muted-foreground">Hạn chót trích xuất từ tài liệu</p>
              </div>
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

            <div className="space-y-3">
              {mockPendingTasks.map((task) => (
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
                        task.priority === "Cao"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {task.dueDate}
                    </span>
                    <span className="truncate max-w-[120px]" title={task.sourceDoc}>
                      {task.sourceDoc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
            <span>Nhiệm vụ mẫu cho giao diện V1 (sẽ được trích xuất tự động khi worker chạy).</span>
          </div>
        </div>
      </div>
    </div>
  )
}
