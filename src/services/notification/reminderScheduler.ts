import type { ReminderRepository } from "@/repositories/reminderRepository"
import type { TaskRepository } from "@/repositories/taskRepository"
import type { NotificationProvider } from "./notificationProvider"
import type { NotificationPayload, ReminderItem } from "./types"

export interface ReminderSchedulerOptions {
  maxRetries?: number
  checkIntervalMs?: number
  missedGracePeriodMs?: number // Default: 2 hours (2 * 60 * 60 * 1000)
}

export class ReminderScheduler {
  private reminderRepository: ReminderRepository
  private taskRepository: TaskRepository
  private notificationProvider: NotificationProvider
  private maxRetries: number
  private checkIntervalMs: number
  private missedGracePeriodMs: number

  private timer: NodeJS.Timeout | null = null
  private isProcessing = false

  constructor(
    reminderRepository: ReminderRepository,
    taskRepository: TaskRepository,
    notificationProvider: NotificationProvider,
    options: ReminderSchedulerOptions = {}
  ) {
    this.reminderRepository = reminderRepository
    this.taskRepository = taskRepository
    this.notificationProvider = notificationProvider
    this.maxRetries = options.maxRetries ?? 3
    this.checkIntervalMs = options.checkIntervalMs ?? 30000
    this.missedGracePeriodMs = options.missedGracePeriodMs ?? 2 * 60 * 60 * 1000
  }

  async start(): Promise<void> {
    if (this.timer) return

    // Startup recovery before regular tick
    await this.recoverPendingReminders()

    this.timer = setInterval(() => {
      void this.tick()
    }, this.checkIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async recoverPendingReminders(): Promise<{ delivered: number; missed: number }> {
    const now = new Date()
    const nowIso = now.toISOString()
    const overdueReminders = await this.reminderRepository.findDuePendingReminders(nowIso)

    let deliveredCount = 0
    let missedCount = 0

    for (const reminder of overdueReminders) {
      const scheduledTime = new Date(reminder.scheduledAt).getTime()
      const overdueMs = now.getTime() - scheduledTime

      if (overdueMs > this.missedGracePeriodMs) {
        // Overdue by more than grace period: mark missed without spamming toast
        await this.reminderRepository.update(reminder.id, {
          status: "missed",
          error: `Quá hạn khi ứng dụng tắt (trễ ${Math.round(overdueMs / 60000)} phút)`,
        })
        missedCount++
      } else {
        // Within grace period: dispatch immediately
        const success = await this.dispatchReminder(reminder)
        if (success) deliveredCount++
      }
    }

    return { delivered: deliveredCount, missed: missedCount }
  }

  async tick(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true
    try {
      const nowIso = new Date().toISOString()
      const dueReminders = await this.reminderRepository.findDuePendingReminders(nowIso)

      for (const reminder of dueReminders) {
        await this.dispatchReminder(reminder)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async dispatchReminder(reminder: ReminderItem): Promise<boolean> {
    const task = await this.taskRepository.findById(reminder.taskId)

    // Invariant: If task was cancelled, rejected, or completed, do not dispatch
    if (!task || task.status === "completed" || task.status === "cancelled" || task.status === "rejected") {
      await this.reminderRepository.update(reminder.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      })
      return false
    }

    // Atomic pre-check: ensure reminder is still pending
    const current = await this.reminderRepository.findById(reminder.id)
    if (!current || current.status !== "pending") {
      return false
    }

    // Prepare privacy-minimized payload
    let reminderText = "Đến hạn công việc"
    if (reminder.reminderType === "1_day_before") {
      reminderText = "Công việc sắp đến hạn trong 1 ngày"
    } else if (reminder.reminderType === "1_hour_before") {
      reminderText = "Công việc sắp đến hạn trong 1 giờ"
    }

    const payload: NotificationPayload = {
      id: reminder.id,
      title: reminderText,
      body: `Đến hạn: ${task.title}`,
      taskId: task.id,
      documentId: task.documentId,
    }

    try {
      const result = await this.notificationProvider.showNotification(payload)
      await this.reminderRepository.markDelivered(reminder.id, result?.notificationId)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const nextRetries = reminder.retryCount + 1

      if (nextRetries >= this.maxRetries) {
        await this.reminderRepository.markFailed(reminder.id, errorMsg, nextRetries)
      } else {
        await this.reminderRepository.update(reminder.id, {
          retryCount: nextRetries,
          error: errorMsg,
        })
      }
      return false
    }
  }
}
