import { CheckSquare, Calendar, Clock, Check, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

const mockTasks = [
  {
    id: "task-1",
    title: "Thanh toán tiền thuê văn phòng đợt 3",
    dueDate: "10/09/2026",
    sourceDoc: "Hop_dong_thue_van_phong_2026.pdf",
    priority: "Cao",
    status: "Chờ xác nhận",
  },
  {
    id: "task-2",
    title: "Gửi biên bản đối soát cho đối tác",
    dueDate: "12/09/2026",
    sourceDoc: "Bien_ban_nghiem_thu_giai_doan_1.docx",
    priority: "Trung bình",
    status: "Đã xác nhận",
  },
  {
    id: "task-3",
    title: "Nộp tờ khai thuế GTGT quý 3",
    dueDate: "20/09/2026",
    sourceDoc: "Thong_bao_nop_thue_Q3_2026.pdf",
    priority: "Cao",
    status: "Chờ xác nhận",
  },
  {
    id: "task-4",
    title: "Kiểm tra hóa đơn dịch vụ cloud tháng 8",
    dueDate: "25/09/2026",
    sourceDoc: "Hoa_don_dich_vu_cloud_thang_8.pdf",
    priority: "Thấp",
    status: "Chờ xác nhận",
  },
]

export function TasksView() {
  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Nhiệm vụ trích xuất từ tài liệu</h2>
          <p className="text-xs text-muted-foreground">Xem xét và xác nhận các công việc được AI trích xuất có chứng cứ</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">3 nhiệm vụ chờ xác nhận</span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {mockTasks.map((task) => (
          <div
            key={task.id}
            className="rounded-xl border border-border bg-card p-4 shadow-xs flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background">
                <CheckSquare className="size-3 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-foreground truncate">{task.title}</h3>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      task.priority === "Cao"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3 text-muted-foreground" />
                    Hạn: {task.dueDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3 text-muted-foreground" />
                    {task.sourceDoc}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 text-muted-foreground" />
                    {task.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Xem chứng cứ
              </Button>
              <Button size="sm" className="h-7 gap-1 text-xs">
                <Check className="size-3" />
                <span>Xác nhận</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
