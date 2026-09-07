import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { CalendarEventRepository } from "@/repositories/calendarEventRepository"
import { InternalCalendarProvider } from "@/services/calendar/internalCalendarProvider"
import type { CreateCalendarEventRequest } from "@/services/calendar/types"

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

describe("InternalCalendarProvider & CalendarEventRepository", () => {
  let docRepo: DocumentRepository
  let taskRepo: TaskRepository
  let eventRepo: CalendarEventRepository
  let provider: InternalCalendarProvider

  const docId = "doc-cal-1"
  const taskId = "task-cal-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    taskRepo = new TaskRepository(db)
    eventRepo = new CalendarEventRepository(db)
    provider = new InternalCalendarProvider(eventRepo)

    // Seed document
    const now = new Date().toISOString()
    await docRepo.create({
      id: docId,
      name: "HopDong.pdf",
      originalPath: "/test/HopDong.pdf",
      storagePath: "storage/HopDong.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      checksum: "chk-cal-1",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    })

    // Seed task
    await taskRepo.create({
      id: taskId,
      documentId: docId,
      title: "Giao nộp báo cáo quý 3",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
      status: "confirmed",
    })
  })

  it("reports availability as true", async () => {
    const avail = await provider.checkAvailability()
    expect(avail.available).toBe(true)
  })

  it("creates a calendar event and preserves date, allDay flag and timezone", async () => {
    const req: CreateCalendarEventRequest = {
      taskId,
      documentId: docId,
      title: "Giao nộp báo cáo quý 3",
      description: "Nộp theo điều khoản hợp đồng",
      startDate: "2026-09-30",
      endDate: "2026-09-30",
      isAllDay: true,
      timezone: "Asia/Ho_Chi_Minh",
      idempotencyKey: `${taskId}:internal`,
    }

    const event = await provider.createEvent(req)

    expect(event.id).toBeDefined()
    expect(event.taskId).toBe(taskId)
    expect(event.documentId).toBe(docId)
    expect(event.provider).toBe("internal")
    expect(event.title).toBe("Giao nộp báo cáo quý 3")
    expect(event.startDate).toBe("2026-09-30")
    expect(event.isAllDay).toBe(true)
    expect(event.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(event.status).toBe("scheduled")
    expect(event.idempotencyKey).toBe(`${taskId}:internal`)

    // Verify lookup by id
    const foundById = await provider.getEvent(event.id)
    expect(foundById).not.toBeNull()
    expect(foundById?.id).toBe(event.id)

    // Verify lookup by idempotency key
    const foundByKey = await provider.getEventByIdempotencyKey(`${taskId}:internal`)
    expect(foundByKey).not.toBeNull()
    expect(foundByKey?.id).toBe(event.id)
  })

  it("ensures idempotency: duplicate createEvent calls return existing event without duplicate rows", async () => {
    const req: CreateCalendarEventRequest = {
      taskId,
      documentId: docId,
      title: "Giao nộp báo cáo quý 3",
      startDate: "2026-09-30",
      endDate: "2026-09-30",
      isAllDay: true,
      timezone: "Asia/Ho_Chi_Minh",
      idempotencyKey: `${taskId}:internal`,
    }

    const first = await provider.createEvent(req)
    const second = await provider.createEvent(req)

    expect(second.id).toBe(first.id)

    // Verify only one event in DB for this task
    const allForTask = await eventRepo.findByTaskId(taskId)
    expect(allForTask).toHaveLength(1)
  })

  it("updates an existing calendar event", async () => {
    const req: CreateCalendarEventRequest = {
      taskId,
      documentId: docId,
      title: "Giao nộp báo cáo quý 3",
      startDate: "2026-09-30",
      endDate: "2026-09-30",
      isAllDay: true,
      timezone: "Asia/Ho_Chi_Minh",
      idempotencyKey: `${taskId}:internal`,
    }

    const event = await provider.createEvent(req)

    const updated = await provider.updateEvent(event.id, {
      title: "Giao nộp báo cáo quý 3 (Đã gia hạn)",
      startDate: "2026-10-15",
      endDate: "2026-10-15",
    })

    expect(updated.title).toBe("Giao nộp báo cáo quý 3 (Đã gia hạn)")
    expect(updated.startDate).toBe("2026-10-15")
    expect(updated.endDate).toBe("2026-10-15")
  })

  it("deletes a calendar event cleanly", async () => {
    const req: CreateCalendarEventRequest = {
      taskId,
      documentId: docId,
      title: "Giao nộp báo cáo quý 3",
      startDate: "2026-09-30",
      endDate: "2026-09-30",
      isAllDay: true,
      timezone: "Asia/Ho_Chi_Minh",
      idempotencyKey: `${taskId}:internal`,
    }

    const event = await provider.createEvent(req)
    await provider.deleteEvent(event.id)

    const found = await provider.getEvent(event.id)
    expect(found).toBeNull()
  })
})
