import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { TaskRepository } from "@/repositories/taskRepository"

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

describe("TaskRepository & Lifecycle Tests", () => {
  let docRepo: DocumentRepository
  let taskRepo: TaskRepository
  const docId = "doc-test-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    taskRepo = new TaskRepository(db)

    const now = new Date().toISOString()
    await docRepo.create({
      id: docId,
      name: "Hop_dong_thue_nha.pdf",
      originalPath: "/path/Hop_dong_thue_nha.pdf",
      storagePath: "storage/Hop_dong_thue_nha.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      checksum: "chk123",
      status: "analyzed",
      createdAt: now,
      updatedAt: now,
    })
  })

  it("creates a task candidate in 'pending' status by default", async () => {
    const now = new Date().toISOString()
    const task = await taskRepo.create({
      id: "task-1",
      documentId: docId,
      title: "Thanh toán tiền thuê tháng đầu",
      description: "Thanh toán theo điều 3 hợp đồng",
      status: "pending",
      deadlineType: "exact",
      rawDeadline: "30/09/2026",
      deadlineDate: "2026-09-30",
      semanticStatus: "VERIFIED",
      confidence: 0.95,
      evidence: JSON.stringify({
        claim: "Tiền thuê thanh toán trước 30/09/2026",
        status: "VERIFIED",
        confidence: 0.95,
        citations: [{ pageNumber: 2, sourceText: "Thanh toán trước ngày 30/09/2026" }],
      }),
      createdAt: now,
      updatedAt: now,
    })

    expect(task.id).toBe("task-1")
    expect(task.status).toBe("pending")
    expect(task.deadlineType).toBe("exact")
    expect(task.deadlineDate).toBe("2026-09-30")
    expect(task.userEdited).toBe(0)
    expect(task.confirmedAt).toBeNull()
  })

  it("finds existing candidate by normalized title and rawDeadline", async () => {
    const now = new Date().toISOString()
    await taskRepo.create({
      id: "task-find",
      documentId: docId,
      title: "Nộp tiền đặt cọc",
      rawDeadline: "trong 7 ngày",
      deadlineType: "relative",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    const found = await taskRepo.findExistingCandidate(docId, "  nộp tiền đặt cọc  ", "trong 7 ngày")
    expect(found).not.toBeNull()
    expect(found?.id).toBe("task-find")

    const notFound = await taskRepo.findExistingCandidate(docId, "Công việc khác")
    expect(notFound).toBeNull()
  })

  it("confirms a pending task directly and records confirmedAt", async () => {
    const now = new Date().toISOString()
    await taskRepo.create({
      id: "task-confirm",
      documentId: docId,
      title: "Gia hạn hợp đồng",
      status: "pending",
      deadlineType: "none",
      createdAt: now,
      updatedAt: now,
    })

    const confirmed = await taskRepo.confirm("task-confirm")
    expect(confirmed.status).toBe("confirmed")
    expect(confirmed.confirmedAt).toBeTruthy()
    expect(confirmed.userEdited).toBe(0)
  })

  it("edits task title/description/deadline during confirmation and marks userEdited = 1", async () => {
    const now = new Date().toISOString()
    await taskRepo.create({
      id: "task-edit-confirm",
      documentId: docId,
      title: "Thanh toán tiền thuê",
      description: "Mô tả ban đầu từ AI",
      rawDeadline: "trong tháng này",
      deadlineType: "ambiguous",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    const confirmed = await taskRepo.confirm("task-edit-confirm", {
      title: "Thanh toán tiền thuê căn hộ 101 đợt 1",
      description: "Đã thống nhất chuyển khoản qua Techcombank",
      deadlineDate: "2026-09-25",
    })

    expect(confirmed.status).toBe("confirmed")
    expect(confirmed.title).toBe("Thanh toán tiền thuê căn hộ 101 đợt 1")
    expect(confirmed.description).toBe("Đã thống nhất chuyển khoản qua Techcombank")
    expect(confirmed.deadlineDate).toBe("2026-09-25")
    expect(confirmed.deadlineType).toBe("exact")
    expect(confirmed.userEdited).toBe(1)
    // Original AI rawDeadline is preserved for audit trail
    expect(confirmed.rawDeadline).toBe("trong tháng này")
  })

  it("rejects a pending task and records rejectedAt", async () => {
    const now = new Date().toISOString()
    await taskRepo.create({
      id: "task-reject",
      documentId: docId,
      title: "Nhiệm vụ không cần thiết",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })

    const rejected = await taskRepo.reject("task-reject")
    expect(rejected.status).toBe("rejected")
    expect(rejected.rejectedAt).toBeTruthy()
  })

  it("filters tasks by status and documentId in findAll", async () => {
    const now = new Date().toISOString()
    await taskRepo.create({
      id: "t-pending",
      documentId: docId,
      title: "Pending 1",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    await taskRepo.create({
      id: "t-confirmed",
      documentId: docId,
      title: "Confirmed 1",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    })

    const pendingList = await taskRepo.findAll({ status: "pending" })
    expect(pendingList.length).toBe(1)
    expect(pendingList[0]?.id).toBe("t-pending")

    const confirmedList = await taskRepo.findAll({ status: "confirmed" })
    expect(confirmedList.length).toBe(1)
    expect(confirmedList[0]?.id).toBe("t-confirmed")
  })
})
