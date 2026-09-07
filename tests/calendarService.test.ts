import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { CalendarEventRepository } from "@/repositories/calendarEventRepository"
import { InternalCalendarProvider } from "@/services/calendar/internalCalendarProvider"
import {
  WindowsCalendarAdapter,
  type WindowsCalendarNativeBridge,
} from "@/services/calendar/windowsCalendarAdapter"
import { CalendarService } from "@/services/calendar/calendarService"
import type { TaskItem } from "@/services/tasks"

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

describe("CalendarService End-to-End Scheduling & Windows Adapter", () => {
  let docRepo: DocumentRepository
  let taskRepo: TaskRepository
  let eventRepo: CalendarEventRepository
  let internalProvider: InternalCalendarProvider
  let mockBridge: WindowsCalendarNativeBridge
  let windowsAdapter: WindowsCalendarAdapter
  let calendarService: CalendarService

  const docId = "doc-svc-1"
  const confirmedTaskId = "task-svc-confirmed-1"
  const pendingTaskId = "task-svc-pending-1"
  const relativeTaskId = "task-svc-relative-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    taskRepo = new TaskRepository(db)
    eventRepo = new CalendarEventRepository(db)
    internalProvider = new InternalCalendarProvider(eventRepo)

    mockBridge = {
      isAvailable: vi.fn().mockResolvedValue(true),
      createEvent: vi.fn().mockResolvedValue({ externalId: "win-event-123" }),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    }

    windowsAdapter = new WindowsCalendarAdapter(eventRepo, mockBridge)

    calendarService = new CalendarService(taskRepo, [
      internalProvider,
      windowsAdapter,
    ])

    const now = new Date().toISOString()
    await docRepo.create({
      id: docId,
      name: "HopDongKinhDoanh.pdf",
      originalPath: "/test/HopDongKinhDoanh.pdf",
      storagePath: "storage/HopDongKinhDoanh.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      checksum: "chk-svc-1",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    })

    // Confirmed task with exact deadline
    await taskRepo.create({
      id: confirmedTaskId,
      documentId: docId,
      title: "Thanh toán đợt 1",
      deadlineType: "exact",
      deadlineDate: "2026-10-01",
      status: "confirmed",
    })

    // Pending task
    await taskRepo.create({
      id: pendingTaskId,
      documentId: docId,
      title: "Nghiệm thu dự án",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
      status: "pending",
    })

    // Relative deadline task
    await taskRepo.create({
      id: relativeTaskId,
      documentId: docId,
      title: "Phản hồi trong 7 ngày",
      deadlineType: "relative",
      rawDeadline: "trong 7 ngày",
      status: "confirmed",
    })
  })

  it("schedules a confirmed task with exact deadline successfully via internal provider", async () => {
    const event = await calendarService.scheduleTask(confirmedTaskId, "internal")

    expect(event).toBeDefined()
    expect(event.taskId).toBe(confirmedTaskId)
    expect(event.provider).toBe("internal")
    expect(event.title).toBe("Thanh toán đợt 1")
    expect(event.startDate).toBe("2026-10-01")
    expect(event.isAllDay).toBe(true)
    expect(event.status).toBe("scheduled")
    expect(event.idempotencyKey).toBe(`${confirmedTaskId}:internal`)
  })

  it("strictly refuses to schedule pending tasks", async () => {
    await expect(calendarService.scheduleTask(pendingTaskId, "internal")).rejects.toThrow(
      /Chỉ công việc đã được xác nhận/
    )

    // Verify no calendar event was created
    const events = await eventRepo.findByTaskId(pendingTaskId)
    expect(events).toHaveLength(0)
  })

  it("strictly refuses to schedule relative deadline tasks without explicit user date", async () => {
    await expect(calendarService.scheduleTask(relativeTaskId, "internal")).rejects.toThrow(
      /Hạn chót tương đối/
    )

    const events = await eventRepo.findByTaskId(relativeTaskId)
    expect(events).toHaveLength(0)
  })

  it("guarantees idempotency: multiple scheduleTask calls do not create duplicate events", async () => {
    const event1 = await calendarService.scheduleTask(confirmedTaskId, "internal")
    const event2 = await calendarService.scheduleTask(confirmedTaskId, "internal")

    expect(event1.id).toBe(event2.id)

    const events = await eventRepo.findByTaskId(confirmedTaskId)
    expect(events).toHaveLength(1)
  })

  it("updates existing calendar event when task details are updated", async () => {
    const originalEvent = await calendarService.scheduleTask(confirmedTaskId, "internal")

    // Update task with new deadline date and title
    await taskRepo.update(confirmedTaskId, {
      title: "Thanh toán đợt 1 (Đã dời ngày)",
      deadlineDate: "2026-10-10",
    })

    const updatedEvent = await calendarService.scheduleTask(confirmedTaskId, "internal")

    expect(updatedEvent.id).toBe(originalEvent.id)
    expect(updatedEvent.title).toBe("Thanh toán đợt 1 (Đã dời ngày)")
    expect(updatedEvent.startDate).toBe("2026-10-10")

    const events = await eventRepo.findByTaskId(confirmedTaskId)
    expect(events).toHaveLength(1)
  })

  it("cancels calendar event when cancelEventForTask is called", async () => {
    await calendarService.scheduleTask(confirmedTaskId, "internal")

    await calendarService.cancelEventForTask(confirmedTaskId, "internal")

    const events = await calendarService.getEventsForTask(confirmedTaskId, "internal")
    expect(events[0]?.status).toBe("cancelled")
  })

  it("syncs task cancellation to calendar events", async () => {
    await calendarService.scheduleTask(confirmedTaskId, "internal")

    const taskItem: TaskItem = {
      id: confirmedTaskId,
      documentId: docId,
      title: "Thanh toán đợt 1",
      status: "cancelled",
      deadlineType: "exact",
      deadlineDate: "2026-10-01",
      semanticStatus: "VERIFIED",
      evidence: null,
      analysisId: null,
      analysisVersion: null,
      confidence: null,
      userEdited: 0,
      rawDeadline: null,
      confirmedAt: null,
      rejectedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await calendarService.syncTaskUpdate(taskItem)

    const events = await calendarService.getEventsForTask(confirmedTaskId, "internal")
    expect(events[0]?.status).toBe("cancelled")
  })

  describe("Windows Calendar Adapter", () => {
    it("reports availability via checkAvailability", async () => {
      const avail = await windowsAdapter.checkAvailability()
      expect(avail.available).toBe(true)
      expect(mockBridge.isAvailable).toHaveBeenCalled()
    })

    it("schedules via Windows Calendar bridge and saves externalEventId", async () => {
      const event = await calendarService.scheduleTask(confirmedTaskId, "windows")

      expect(event.provider).toBe("windows")
      expect(event.externalEventId).toBe("win-event-123")
      expect(mockBridge.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Thanh toán đợt 1",
          startDate: "2026-10-01",
          isAllDay: true,
        })
      )
    })

    it("surfaces actionable failure when Windows bridge reports unavailable and preserves task", async () => {
      vi.mocked(mockBridge.isAvailable).mockResolvedValueOnce(false)

      await expect(calendarService.scheduleTask(confirmedTaskId, "windows")).rejects.toThrow(
        /Windows Calendar/
      )

      // Task in DB remains confirmed and unaffected
      const task = await taskRepo.findById(confirmedTaskId)
      expect(task?.status).toBe("confirmed")
    })
  })
})
