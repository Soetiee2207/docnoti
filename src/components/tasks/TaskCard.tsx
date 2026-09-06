import { useState } from "react"
import {
  Calendar,
  Clock,
  Check,
  X,
  Edit2,
  AlertTriangle,
  Quote,
  ArrowUpRight,
  UserCheck,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/documents/EvidenceBadge"
import type { TaskItem } from "@/services/tasks"

export interface TaskCardProps {
  task: TaskItem
  onConfirm: (
    id: string,
    edits?: { title?: string; description?: string | null; deadlineDate?: string | null }
  ) => Promise<void>
  onReject: (id: string) => Promise<void>
  onNavigateToPage?: (pageNumber: number) => void
  documentName?: string
}

export function TaskCard({
  task,
  onConfirm,
  onReject,
  onNavigateToPage,
  documentName,
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description ?? "")
  const [editDeadlineDate, setEditDeadlineDate] = useState(task.deadlineDate ?? "")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirmDirect = async () => {
    try {
      setIsProcessing(true)
      setError(null)
      await onConfirm(task.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmWithEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTitle.trim()) return

    try {
      setIsProcessing(true)
      setError(null)
      await onConfirm(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        deadlineDate: editDeadlineDate || null,
      })
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    try {
      setIsProcessing(true)
      setError(null)
      await onReject(task.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 shadow-xs transition-colors ${
        task.status === "confirmed"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : task.status === "rejected"
          ? "border-border/60 bg-muted/20 opacity-70"
          : "border-border bg-card"
      }`}
    >
      {/* Top Bar: Badges and Lifecycle Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status Badge */}
          {task.status === "pending" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
              <Clock className="size-3" />
              <span>Chờ xác nhận</span>
            </span>
          )}
          {task.status === "confirmed" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <Check className="size-3" />
              <span>Đã xác nhận</span>
            </span>
          )}
          {task.status === "rejected" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 border border-rose-500/20">
              <X className="size-3" />
              <span>Đã từ chối</span>
            </span>
          )}

          {/* Semantic Status Badge */}
          <StatusBadge status={task.semanticStatus} />

          {/* User Edited Marker */}
          {task.userEdited === 1 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400 border border-sky-500/20">
              <UserCheck className="size-2.5" />
              <span>Đã sửa bởi người dùng</span>
            </span>
          )}
        </div>

        {documentName && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <FileText className="size-3" />
            <span className="truncate max-w-[180px]">{documentName}</span>
          </span>
        )}
      </div>

      {/* Main Content or Edit Form */}
      {isEditing ? (
        <form onSubmit={handleConfirmWithEdit} className="mt-3 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Tiêu đề nhiệm vụ <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Mô tả / Ghi chú</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Hạn chót cụ thể (YYYY-MM-DD)</label>
            <input
              type="date"
              value={editDeadlineDate}
              onChange={(e) => setEditDeadlineDate(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
            {task.rawDeadline && (
              <p className="text-[11px] text-muted-foreground">
                Gốc từ tài liệu: <span className="italic font-medium">{task.rawDeadline}</span>
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
              disabled={isProcessing}
              className="h-7 text-xs"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!editTitle.trim() || isProcessing}
              className="h-7 gap-1 text-xs"
            >
              <Check className="size-3" />
              <span>Lưu & Xác nhận</span>
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div>
            <h3 className="text-xs font-semibold text-foreground leading-snug">{task.title}</h3>
            {task.description && (
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Deadline Representation */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {task.deadlineType === "exact" && task.deadlineDate && (
              <div className="inline-flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-1 text-secondary-foreground font-medium">
                <Calendar className="size-3.5 text-primary" />
                <span>{`Hạn chót: ${task.deadlineDate}`}</span>
                {task.rawDeadline && task.rawDeadline !== task.deadlineDate && (
                  <span className="text-[10px] text-muted-foreground">({task.rawDeadline})</span>
                )}
              </div>
            )}

            {task.deadlineType === "relative" && task.rawDeadline && (
              <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300 font-medium border border-amber-500/20">
                <Clock className="size-3.5 text-amber-600" />
                <span>{`Thời hạn tương đối: ${task.rawDeadline}`}</span>
              </div>
            )}

            {task.deadlineType === "ambiguous" && task.rawDeadline && (
              <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium border border-border/60">
                <AlertTriangle className="size-3.5 text-amber-500" />
                <span>{`Thời hạn chưa cụ thể: ${task.rawDeadline}`}</span>
              </div>
            )}

            {task.deadlineType === "none" && (
              <span className="text-[11px] text-muted-foreground italic">Không có hạn chót cụ thể</span>
            )}
          </div>

          {/* Grounding Evidence */}
          {task.evidence && (
            <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground flex items-center gap-1">
                  <Quote className="size-3 text-muted-foreground" />
                  Căn cứ trích dẫn
                </span>
                {task.evidence.citations?.[0]?.pageNumber && onNavigateToPage && (
                  <button
                    type="button"
                    onClick={() => onNavigateToPage(task.evidence!.citations[0]!.pageNumber)}
                    className="inline-flex items-center gap-0.5 text-primary hover:underline cursor-pointer font-semibold"
                  >
                    <span>{`Trang ${task.evidence.citations[0].pageNumber}`}</span>
                    <ArrowUpRight className="size-2.5" />
                  </button>
                )}
                {task.evidence.citations?.[0]?.pageNumber && !onNavigateToPage && (
                  <span className="text-muted-foreground">
                    {`Trang ${task.evidence.citations[0].pageNumber}`}
                  </span>
                )}
              </div>

              {task.evidence.claim && (
                <p className="text-foreground/90 font-medium">{task.evidence.claim}</p>
              )}

              {task.evidence.citations?.[0]?.sourceText && (
                <blockquote className="border-l-2 border-primary/40 pl-2 italic text-foreground/80">
                  {`"${task.evidence.citations[0].sourceText}"`}
                </blockquote>
              )}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Action Buttons for Pending Items */}
          {task.status === "pending" && (
            <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                * Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  disabled={isProcessing}
                  className="h-7 gap-1 text-xs"
                >
                  <Edit2 className="size-3" />
                  <span>Sửa</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="size-3" />
                  <span>Từ chối</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmDirect}
                  disabled={isProcessing}
                  className="h-7 gap-1 text-xs"
                >
                  <Check className="size-3" />
                  <span>Xác nhận</span>
                </Button>
              </div>
            </div>
          )}

          {task.status === "confirmed" && task.confirmedAt && (
            <div className="pt-1 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Đã xác nhận: {new Date(task.confirmedAt).toLocaleString("vi-VN")}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Sẵn sàng đồng bộ</span>
            </div>
          )}

          {task.status === "rejected" && task.rejectedAt && (
            <div className="pt-1 text-[10px] text-muted-foreground">
              Đã từ chối: {new Date(task.rejectedAt).toLocaleString("vi-VN")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
