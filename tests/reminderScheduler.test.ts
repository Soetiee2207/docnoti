import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { ReminderRepository } from "@/repositories/reminderRepository"
import { NotificationService } from "@/services/notification/notificationService"
import { ReminderScheduler } from "@/services/notification/reminderScheduler"
import type { NotificationProvider } from "@/services/notification/notificationProvider"
import type { TaskItem } from "@/services/tasks/types"

function createTestContext() {
  const sqlite = new DatabaseSync(":memory:")

  const executor: MigrationExecutor = {
    async execute(sql: string) {
      sqlite.exec(sql)
    },
    async query<T = unknown>(sql: string): Promise<T[]> {
      const stmt = sqlite.prepare(sql)
      return stmt.all() as T[]
    },
  }

  const db = createProxyDrizzleDb(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql)
    if (method === "run") {
      stmt.run(...(params as (string | number | bigint | null)[]))
      return { rows: [] }
    }

    stmt.setReturnArrays(true)
    if (method === "get") {
      const row = stmt.get(...(params as (string | number | bigint | null)[]))
      return { rows: (row ?? undefined) as unknown[] }
    }

    const rows = stmt.all(...(params as (string | number | bigint | null)[]))
    return { rows }
  })

  return { sqlite, executor, db }
}

describe("NotificationService & Background Reminder Scheduler", () => {
  let docRepo: DocumentRepository
  let taskRepo: TaskRepository
  let reminderRepo: ReminderRepository
  let notificationService: NotificationService
  let mockProvider: NotificationProvider
  let scheduler: ReminderScheduler

  const docId = "doc-rem-1"
  const confirmedTaskId = "task-rem-confirmed-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    taskRepo = new TaskRepository(db)
    reminderRepo = new ReminderRepository(db)

    mockProvider = {
      id: "windows_toast",
      name: "Mock Windows Toast",
      checkAvailability: vi.fn().mockResolvedValue({ available: true }),
      showNotification: vi.fn().mockResolvedValue({ notificationId: "toast-123" }),
      cancelNotification: vi.fn().mockResolvedValue(undefined),
    }

    notificationService = new NotificationService(taskRepo, reminderRepo)
    scheduler = new ReminderScheduler(reminderRepo, taskRepo, mockProvider)

    const now = new Date().toISOString()
    await docRepo.create({
      id: docId,
      name: "ThongBaoThue.pdf",
      originalPath: "/test/ThongBaoThue.pdf",
      storagePath: "storage/ThongBaoThue.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      checksum: "chk-rem-1",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    })

    await taskRepo.create({
      id: confirmedTaskId,
      documentId: docId,
      title: "Nộp tờ khai thuế GTGT quý 3",
      deadlineType: "exact",
      deadlineDate: "2026-10-20",
      status: "confirmed",
    })
  })

  describe("Lead Time & All-Day Time Calculations", () => {
    it("anchors all-day deadline to 09:00:00 local time", () => {
      const atDeadline = notificationService.calculateScheduledTime("2026-10-20", "at_deadline")
      const d = new Date(atDeadline)
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(9) // October
      expect(d.getDate()).toBe(20)
      expect(d.getHours()).toBe(9)

      const oneDayBefore = notificationService.calculateScheduledTime("2026-10-20", "1_day_before")
      const dBefore = new Date(oneDayBefore)
      expect(dBefore.getDate()).toBe(19)
      expect(dBefore.getHours()).toBe(9)

      const oneHourBefore = notificationService.calculateScheduledTime("2026-10-20", "1_hour_before")
      const dHour = new Date(oneHourBefore)
      expect(dHour.getDate()).toBe(20)
      expect(dHour.getHours()).toBe(8)
    })

    it("calculates exact offsets when deadline includes timestamp", () => {
      const exactTime = "2026-10-20T16:00:00.000Z"
      const atDeadline = notificationService.calculateScheduledTime(exactTime, "at_deadline")
      expect(atDeadline).toBe(exactTime)

      const oneHourBefore = notificationService.calculateScheduledTime(exactTime, "1_hour_before")
      expect(oneHourBefore).toBe("2026-10-20T15:00:00.000Z")

      const oneDayBefore = notificationService.calculateScheduledTime(exactTime, "1_day_before")
      expect(oneDayBefore).toBe("2026-10-19T16:00:00.000Z")
    })
  })

  describe("Scheduling & Idempotency", () => {
    it("schedules reminders for configured lead times", async () => {
      const reminders = await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["1_day_before", "at_deadline"],
      })

      expect(reminders).toHaveLength(2)
      expect(reminders.map((r) => r.reminderType)).toContain("1_day_before")
      expect(reminders.map((r) => r.reminderType)).toContain("at_deadline")
      expect(reminders.every((r) => r.status === "pending")).toBe(true)
    })

    it("is strictly idempotent: scheduling again with same config does not duplicate rows", async () => {
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["1_day_before", "at_deadline"],
      })
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["1_day_before", "at_deadline"],
      })

      const all = await reminderRepo.findByTaskId(confirmedTaskId)
      expect(all).toHaveLength(2)
    })

    it("cancels unselected lead times when configuration changes", async () => {
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["1_day_before", "at_deadline"],
      })

      // Now update config to only have 'at_deadline'
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["at_deadline"],
      })

      const all = await reminderRepo.findByTaskId(confirmedTaskId)
      const oneDay = all.find((r) => r.reminderType === "1_day_before")
      const atDeadline = all.find((r) => r.reminderType === "at_deadline")

      expect(oneDay?.status).toBe("cancelled")
      expect(atDeadline?.status).toBe("pending")
    })
  })

  describe("Task Lifecycle Synchronization", () => {
    it("updates scheduledAt when task deadline date changes", async () => {
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["at_deadline"],
      })

      const originalReminder = (await reminderRepo.findByTaskId(confirmedTaskId))[0]

      // Task deadline edited to new date
      const updatedTask: TaskItem = {
        id: confirmedTaskId,
        documentId: docId,
        title: "Nộp tờ khai thuế GTGT quý 3",
        deadlineType: "exact",
        deadlineDate: "2026-10-25",
        status: "confirmed",
        semanticStatus: "VERIFIED",
        evidence: null,
        analysisId: null,
        analysisVersion: null,
        confidence: 0.99,
        userEdited: 1,
        rawDeadline: "25/10/2026",
        confirmedAt: new Date().toISOString(),
        rejectedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await notificationService.syncTaskUpdate(updatedTask)

      const updatedReminder = await reminderRepo.findById(originalReminder.id)
      expect(updatedReminder?.scheduledAt).not.toBe(originalReminder.scheduledAt)
      expect(new Date(updatedReminder!.scheduledAt).getDate()).toBe(25)
    })

    it("cancels pending reminders when task is cancelled or completed", async () => {
      await notificationService.scheduleRemindersForTask(confirmedTaskId, {
        leadTimes: ["at_deadline"],
      })

      const completedTask: TaskItem = {
        id: confirmedTaskId,
        documentId: docId,
        title: "Nộp tờ khai thuế GTGT quý 3",
        deadlineType: "exact",
        deadlineDate: "2026-10-20",
        status: "completed",
        semanticStatus: "VERIFIED",
        evidence: null,
        analysisId: null,
        analysisVersion: null,
        confidence: 0.99,
        userEdited: 0,
        rawDeadline: null,
        confirmedAt: new Date().toISOString(),
        rejectedAt: null,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await notificationService.syncTaskUpdate(completedTask)

      const all = await reminderRepo.findByTaskId(confirmedTaskId)
      expect(all[0]?.status).toBe("cancelled")
    })
  })

  describe("Background Scheduler & Recovery", () => {
    it("dispatches due pending reminders during tick and updates status to delivered", async () => {
      // Create a reminder that is due right now
      const nowIso = new Date(Date.now() - 1000).toISOString()
      const reminder = await reminderRepo.create({
        id: "rem-due-1",
        taskId: confirmedTaskId,
        documentId: docId,
        provider: "windows_toast",
        reminderType: "at_deadline",
        scheduledAt: nowIso,
        status: "pending",
        idempotencyKey: `${confirmedTaskId}:at_deadline`,
        retryCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      })

      await scheduler.tick()

      expect(mockProvider.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: reminder.id,
          body: expect.stringContaining("Nộp tờ khai thuế"),
        })
      )

      const updated = await reminderRepo.findById(reminder.id)
      expect(updated?.status).toBe("delivered")
      expect(updated?.deliveredAt).toBeDefined()
    })

    it("prevents double dispatch when tick runs again", async () => {
      const nowIso = new Date(Date.now() - 1000).toISOString()
      await reminderRepo.create({
        id: "rem-due-2",
        taskId: confirmedTaskId,
        documentId: docId,
        provider: "windows_toast",
        reminderType: "at_deadline",
        scheduledAt: nowIso,
        status: "pending",
        idempotencyKey: `${confirmedTaskId}:at_deadline_2`,
        retryCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      })

      await scheduler.tick()
      expect(mockProvider.showNotification).toHaveBeenCalledTimes(1)

      // Second tick
      await scheduler.tick()
      expect(mockProvider.showNotification).toHaveBeenCalledTimes(1) // Still 1!
    })

    it("recovers overdue reminders on startup: dispatches recent (<= 2h) and marks missed (> 2h)", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

      // Recent overdue reminder (1 hour ago, within 2h grace period)
      await reminderRepo.create({
        id: "rem-recent",
        taskId: confirmedTaskId,
        documentId: docId,
        provider: "windows_toast",
        reminderType: "1_hour_before",
        scheduledAt: oneHourAgo,
        status: "pending",
        idempotencyKey: "rem-recent-key",
        retryCount: 0,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      })

      // Old overdue reminder (3 hours ago, exceeds 2h grace period)
      await reminderRepo.create({
        id: "rem-old",
        taskId: confirmedTaskId,
        documentId: docId,
        provider: "windows_toast",
        reminderType: "1_day_before",
        scheduledAt: threeHoursAgo,
        status: "pending",
        idempotencyKey: "rem-old-key",
        retryCount: 0,
        createdAt: threeHoursAgo,
        updatedAt: threeHoursAgo,
      })

      const recoveryRes = await scheduler.recoverPendingReminders()

      expect(recoveryRes.delivered).toBe(1)
      expect(recoveryRes.missed).toBe(1)

      const recentRem = await reminderRepo.findById("rem-recent")
      expect(recentRem?.status).toBe("delivered")

      const oldRem = await reminderRepo.findById("rem-old")
      expect(oldRem?.status).toBe("missed")
    })
  })
})
