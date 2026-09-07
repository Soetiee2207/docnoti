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
  CalendarPlus,
  CalendarCheck,
  Loader2,
  AlertCircle,
  Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/documents/EvidenceBadge"
import type { TaskItem } from "@/services/tasks"
import { useCalendar } from "@/hooks/useCalendar"
import { useReminders } from "@/hooks/useReminders"
import type { ReminderType } from "@/services/notification"

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

  const [selectedProvider, setSelectedProvider] = useState<string>("internal")
  const [isScheduling, setIsScheduling] = useState<boolean>(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  const {
    events,
    providers,
    scheduleTask,
    cancelEvent,
    checkEligibility,
  } = useCalendar({ taskId: task.id })

  const {
    reminders,
    providerAvailability: toastAvailability,
    configureReminders,
  } = useReminders({ taskId: task.id })

  const [isUpdatingReminders, setIsUpdatingReminders] = useState(false)
  const [reminderError, setReminderError] = useState<string | null>(null)

  const scheduledEvent = events.find((e) => e.status === "scheduled")
  const eligibility = checkEligibility(task)

  const activeReminderTypes = reminders
    .filter((r) => r.status === "pending" || r.status === "delivered")
    .map((r) => r.reminderType)

  const handleToggleLeadTime = async (type: ReminderType) => {
    try {
      setIsUpdatingReminders(true)
      setReminderError(null)
      const nextTypes = activeReminderTypes.includes(type)
        ? activeReminderTypes.filter((t) => t !== type)
        : [...activeReminderTypes, type]
      await configureReminders(task.id, nextTypes)
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsUpdatingReminders(false)
    }
  }

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

  const handleAddToCalendar = async () => {
    try {
      setIsScheduling(true)
      setCalendarError(null)
      await scheduleTask(task.id, selectedProvider)
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsScheduling(false)
    }
  }

  const handleCancelCalendar = async () => {
    try {
      setIsScheduling(true)
      setCalendarError(null)
      await cancelEvent(task.id)
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsScheduling(false)
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

          {task.status === "confirmed" && (
            <div className="pt-2 border-t border-border/40 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {scheduledEvent ? (
                  <div className="flex flex-wrap items-center justify-between w-full gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                        <CalendarCheck className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
                          <span>Đã lên lịch</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/30">
                            {scheduledEvent.provider === "windows" ? "Windows Calendar" : "Lịch nội bộ"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {scheduledEvent.isAllDay ? "Cả ngày" : "Giờ hẹn"}: {scheduledEvent.startDate}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelCalendar}
                      disabled={isScheduling}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      Hủy khỏi lịch
                    </Button>
                  </div>
                ) : eligibility.eligible ? (
                  <div className="flex flex-wrap items-center justify-between w-full gap-2 bg-muted/40 border border-border/50 rounded-md p-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-primary" />
                      <div>
                        <span className="font-medium text-foreground text-xs">Lên lịch sự kiện</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {providers.length > 1 ? (
                            <select
                              value={selectedProvider}
                              onChange={(e) => setSelectedProvider(e.target.value)}
                              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-foreground"
                            >
                              {providers.map((p) => (
                                <option key={p.id} value={p.id} disabled={!p.availability.available}>
                                  {p.name} {!p.availability.available ? "(Không khả dụng)" : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Lịch nội bộ</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleAddToCalendar}
                      disabled={isScheduling}
                      className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {isScheduling ? <Loader2 className="size-3 animate-spin" /> : <CalendarPlus className="size-3" />}
                      <span>Thêm vào lịch</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between w-full gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md p-2">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                          Chưa thể thêm vào lịch
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {eligibility.reason}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="h-6 text-[11px] shrink-0 border-amber-500/30 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
                    >
                      Sửa hạn chót
                    </Button>
                  </div>
                )}

                {calendarError && (
                  <p className="text-xs text-destructive flex items-center gap-1 w-full">
                    <AlertCircle className="size-3" />
                    <span>{calendarError}</span>
                  </p>
                )}

                {/* Reminders & Windows Toast Notifications */}
                {eligibility.eligible && (
                  <div className="w-full bg-muted/40 border border-border/50 rounded-md p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                        <Bell className="size-3.5 text-primary" />
                        <span>Nhắc nhở thông báo (Windows Toast)</span>
                      </div>
                      {toastAvailability && !toastAvailability.available && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          (Chưa bật native)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeReminderTypes.includes("1_day_before")}
                          onChange={() => handleToggleLeadTime("1_day_before")}
                          disabled={isUpdatingReminders}
                          className="rounded border-border"
                        />
                        <span className="text-[11px] text-foreground">Trước 1 ngày</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeReminderTypes.includes("1_hour_before")}
                          onChange={() => handleToggleLeadTime("1_hour_before")}
                          disabled={isUpdatingReminders}
                          className="rounded border-border"
                        />
                        <span className="text-[11px] text-foreground">Trước 1 giờ</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeReminderTypes.includes("at_deadline")}
                          onChange={() => handleToggleLeadTime("at_deadline")}
                          disabled={isUpdatingReminders}
                          className="rounded border-border"
                        />
                        <span className="text-[11px] text-foreground">Đúng hạn</span>
                      </label>
                    </div>

                    {/* Active reminders list */}
                    {reminders.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                        {reminders.map((r) => (
                          <span
                            key={r.id}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                              r.status === "delivered"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : r.status === "pending"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : r.status === "missed"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <span>
                              {`${
                                r.reminderType === "1_day_before"
                                  ? "1 ngày"
                                  : r.reminderType === "1_hour_before"
                                  ? "1 giờ"
                                  : "Đúng hạn"
                              }: ${
                                r.status === "delivered"
                                  ? "Đã gửi"
                                  : r.status === "pending"
                                  ? "Đã lên lịch"
                                  : r.status === "missed"
                                  ? "Đã lỡ"
                                  : r.status
                              }`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {reminderError && (
                      <p className="text-xs text-destructive">{reminderError}</p>
                    )}
                  </div>
                )}
              </div>

              {task.confirmedAt && (
                <div className="pt-1 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>Đã xác nhận: {new Date(task.confirmedAt).toLocaleString("vi-VN")}</span>
                </div>
              )}
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
