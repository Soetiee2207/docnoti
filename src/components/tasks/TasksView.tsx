import { useState, useEffect } from "react"
import { CheckSquare, Clock, Check, X, AlertCircle, Loader2 } from "lucide-react"
import { useTasks } from "@/hooks/useTasks"
import { TaskCard } from "./TaskCard"
import { getAppServices } from "@/services"
import type { TaskStatus } from "@/services/tasks"

type FilterTab = "all" | TaskStatus

export function TasksView() {
  const [activeTab, setActiveTab] = useState<FilterTab>("pending")
  const {
    tasks,
    loading,
    error,
    pendingCount,
    confirmedCount,
    rejectedCount,
    confirmTask,
    rejectTask,
  } = useTasks({
    status: activeTab === "all" ? undefined : activeTab,
  })

  const [documentNames, setDocumentNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let isMounted = true
    getAppServices()
      .then((services) => services.documentRepo.findAll())
      .then((docs) => {
        if (isMounted) {
          const map: Record<string, string> = {}
          for (const d of docs) {
            map[d.id] = d.name
          }
          setDocumentNames(map)
        }
      })
      .catch((err) => {
        console.warn("Failed to load document names for tasks view:", err)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Nhiệm vụ & Hạn chót trích xuất</h2>
          <p className="text-xs text-muted-foreground">
            Xem xét, chỉnh sửa và xác nhận các công việc được AI trích xuất có chứng cứ
          </p>
        </div>

        {/* Global Pending Counter */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
              <Clock className="size-3.5" />
              <span>{pendingCount} nhiệm vụ chờ bạn xác nhận</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <Check className="size-3.5" />
              <span>Tất cả nhiệm vụ đã được xử lý</span>
            </span>
          )}
        </div>
      </div>

      {/* Safety Boundary Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground flex items-start gap-2.5">
        <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-primary">Quy tắc an toàn & Ranh giới kiểm soát</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            AI tuyệt đối không tự ý thêm sự kiện vào Lịch Windows hay tạo Thông báo hệ thống. Mọi
            nhiệm vụ do AI trích xuất đều ở trạng thái chờ duyệt. Chỉ những nhiệm vụ được bạn{" "}
            <strong>xác nhận</strong> mới trở thành hành động chính thức để tích hợp về sau.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === "pending"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Clock className="size-3.5" />
          <span>Chờ xác nhận ({pendingCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("confirmed")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === "confirmed"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Check className="size-3.5" />
          <span>Đã xác nhận ({confirmedCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("rejected")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === "rejected"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <X className="size-3.5" />
          <span>Từ chối ({rejectedCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === "all"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <CheckSquare className="size-3.5" />
          <span>Tất cả ({pendingCount + confirmedCount + rejectedCount})</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mb-2" />
          <p className="text-xs">Đang tải danh sách nhiệm vụ...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
          <CheckSquare className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs font-medium text-foreground">
            {activeTab === "pending"
              ? "Không có nhiệm vụ nào đang chờ xác nhận"
              : activeTab === "confirmed"
              ? "Chưa có nhiệm vụ nào được xác nhận"
              : activeTab === "rejected"
              ? "Không có nhiệm vụ nào bị từ chối"
              : "Chưa có nhiệm vụ nào được trích xuất"}
          </p>
          <p className="mt-1 text-[11px] max-w-sm">
            Khi tài liệu được phân tích xong, các nhiệm vụ và hạn chót kèm bằng chứng trích dẫn sẽ
            xuất hiện tại đây để bạn kiểm duyệt.
          </p>
        </div>
      )}

      {/* Task Cards List */}
      {!loading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onConfirm={confirmTask}
              onReject={rejectTask}
              documentName={documentNames[task.documentId]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
