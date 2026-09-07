import type { TaskRepository } from "@/repositories/taskRepository"
import type { ReminderRepository } from "@/repositories/reminderRepository"
import type { TaskItem } from "@/services/tasks/types"
import type {
  ReminderConfig,
  ReminderItem,
  ReminderType,
  ReminderEligibilityResult,
  NewReminderRecord,
} from "./types"

export class NotificationService {
  private taskRepository: TaskRepository
  private reminderRepository: ReminderRepository

  constructor(
    taskRepository: TaskRepository,
    reminderRepository: ReminderRepository
  ) {
    this.taskRepository = taskRepository
    this.reminderRepository = reminderRepository
  }

  validateTaskEligibility(task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">): ReminderEligibilityResult {
    // Rule 1: Only confirmed tasks can be scheduled for reminders
    if (task.status !== "confirmed") {
      return {
        eligible: false,
        reason: `Công việc đang ở trạng thái '${task.status}'. Chỉ công việc đã được xác nhận (confirmed) mới có thể lên lịch nhắc nhở.`,
      }
    }

    // Rule 2: Deadline must be exact
    if (task.deadlineType !== "exact") {
      if (task.deadlineType === "relative") {
        return {
          eligible: false,
          reason: "Hạn chót tương đối (relative) chưa được quy đổi thành ngày cụ thể. Hãy chỉnh sửa hạn chót trước khi đặt nhắc nhở.",
        }
      }
      if (task.deadlineType === "ambiguous") {
        return {
          eligible: false,
          reason: "Hạn chót không rõ ràng (ambiguous). Vui lòng xác định ngày cụ thể trước khi đặt nhắc nhở.",
        }
      }
      return {
        eligible: false,
        reason: "Công việc không có hạn chót (deadlineType: none). Không thể tự ý tạo lịch nhắc nhở.",
      }
    }

    // Rule 3: Valid date format
    if (!task.deadlineDate || task.deadlineDate.trim() === "") {
      return {
        eligible: false,
        reason: "Thiếu ngày hạn chót hợp lệ.",
      }
    }

    const parsedDate = new Date(task.deadlineDate)
    if (Number.isNaN(parsedDate.getTime())) {
      return {
        eligible: false,
        reason: `Ngày hạn chót '${task.deadlineDate}' không đúng định dạng ngày hợp lệ.`,
      }
    }

    return { eligible: true }
  }

  calculateScheduledTime(deadlineDateStr: string, leadTime: ReminderType): string {
    const hasTime = deadlineDateStr.includes("T")

    if (hasTime) {
      const base = new Date(deadlineDateStr)
      if (leadTime === "at_deadline") {
        return base.toISOString()
      }
      if (leadTime === "1_hour_before") {
        return new Date(base.getTime() - 60 * 60 * 1000).toISOString()
      }
      if (leadTime === "1_day_before") {
        return new Date(base.getTime() - 24 * 60 * 60 * 1000).toISOString()
      }
      return base.toISOString()
    }

    // All-day deadline policy: anchor to 09:00:00 local time
    const parts = deadlineDateStr.split("-").map(Number)
    const year = parts[0]
    const monthIndex = (parts[1] || 1) - 1
    const day = parts[2] || 1

    if (leadTime === "at_deadline") {
      const target = new Date(year, monthIndex, day, 9, 0, 0)
      return target.toISOString()
    }
    if (leadTime === "1_day_before") {
      const target = new Date(year, monthIndex, day - 1, 9, 0, 0)
      return target.toISOString()
    }
    if (leadTime === "1_hour_before") {
      const target = new Date(year, monthIndex, day, 8, 0, 0)
      return target.toISOString()
    }

    const fallback = new Date(year, monthIndex, day, 9, 0, 0)
    return fallback.toISOString()
  }

  async scheduleRemindersForTask(
    taskId: string,
    config: ReminderConfig,
    providerId = "windows_toast"
  ): Promise<ReminderItem[]> {
    const taskRecord = await this.taskRepository.findById(taskId)
    if (!taskRecord) {
      throw new Error(`Công việc với ID '${taskId}' không tồn tại.`)
    }

    const eligibility = this.validateTaskEligibility({
      status: taskRecord.status as TaskItem["status"],
      deadlineType: taskRecord.deadlineType as TaskItem["deadlineType"],
      deadlineDate: taskRecord.deadlineDate,
    })

    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Công việc không đủ điều kiện tạo nhắc nhở.")
    }

    const now = new Date().toISOString()
    const existingReminders = await this.reminderRepository.findByTaskId(taskId)
    const activeResults: ReminderItem[] = []

    // 1. Process configured lead times
    for (const leadTime of config.leadTimes) {
      const idempotencyKey = `${taskRecord.id}:${leadTime}`
      const scheduledAt = this.calculateScheduledTime(taskRecord.deadlineDate!, leadTime)

      const existing = existingReminders.find((r) => r.idempotencyKey === idempotencyKey)

      if (existing) {
        if (existing.status === "cancelled" || existing.status === "failed") {
          const updated = await this.reminderRepository.update(existing.id, {
            status: "pending",
            scheduledAt,
            error: null,
          })
          activeResults.push(updated)
        } else if (existing.status === "pending") {
          // If deadline changed, update scheduledAt
          if (existing.scheduledAt !== scheduledAt) {
            const updated = await this.reminderRepository.update(existing.id, {
              scheduledAt,
            })
            activeResults.push(updated)
          } else {
            activeResults.push(existing)
          }
        } else {
          // Keep already delivered/missed records
          activeResults.push(existing)
        }
      } else {
        // Create new reminder
        const newRecord: NewReminderRecord = {
          id: crypto.randomUUID(),
          taskId: taskRecord.id,
          documentId: taskRecord.documentId,
          provider: providerId,
          reminderType: leadTime,
          scheduledAt,
          status: "pending",
          idempotencyKey,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        }
        const created = await this.reminderRepository.create(newRecord)
        activeResults.push(created)
      }
    }

    // 2. Invalidate any pending reminders that are no longer enabled in config
    for (const existing of existingReminders) {
      if (!config.leadTimes.includes(existing.reminderType) && existing.status === "pending") {
        await this.reminderRepository.update(existing.id, {
          status: "cancelled",
          cancelledAt: now,
        })
      }
    }

    return activeResults
  }

  async syncTaskUpdate(task: TaskItem): Promise<void> {
    const reminders = await this.reminderRepository.findByTaskId(task.id)
    const now = new Date().toISOString()

    // If task is completed, cancelled, or rejected, cancel all pending reminders
    if (task.status === "completed" || task.status === "cancelled" || task.status === "rejected") {
      for (const reminder of reminders) {
        if (reminder.status === "pending") {
          await this.reminderRepository.update(reminder.id, {
            status: "cancelled",
            cancelledAt: now,
          })
        }
      }
      return
    }

    // If task is confirmed and has exact deadline, update scheduled times for pending reminders
    if (task.status === "confirmed" && task.deadlineType === "exact" && task.deadlineDate) {
      for (const reminder of reminders) {
        if (reminder.status === "pending") {
          const newScheduledAt = this.calculateScheduledTime(task.deadlineDate, reminder.reminderType)
          if (reminder.scheduledAt !== newScheduledAt) {
            await this.reminderRepository.update(reminder.id, {
              scheduledAt: newScheduledAt,
            })
          }
        }
      }
    }
  }

  async cancelRemindersForTask(taskId: string): Promise<void> {
    await this.reminderRepository.cancelPendingForTask(taskId)
  }

  async getRemindersForTask(taskId: string): Promise<ReminderItem[]> {
    return this.reminderRepository.findByTaskId(taskId)
  }
}
