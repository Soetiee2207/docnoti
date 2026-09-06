import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { AnalysisRepository } from "@/repositories/analysisRepository"
import { TaskExtractionService } from "@/services/tasks/taskExtractionService"
import type { AnalysisResult } from "@/services/ai/types"

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

function makeSampleAnalysisResult(): AnalysisResult {
  return {
    documentId: "doc-sample-1",
    documentType: "CONTRACT",
    summary: "Hợp đồng thuê nhà với các điều khoản thanh toán.",
    fields: [
      {
        name: "Hạn thanh toán đợt 1",
        value: "30/09/2026",
        semanticStatus: "VERIFIED",
        confidence: 0.98,
        evidence: {
          claim: "Bên thuê thanh toán tiền thuê đợt 1 trước ngày 30/09/2026",
          status: "VERIFIED",
          confidence: 0.98,
          citations: [
            {
              pageNumber: 2,
              sourceText: "Tiền thuê đợt 1 thanh toán trước ngày 30/09/2026 qua chuyển khoản.",
            },
          ],
        },
      },
      {
        name: "Thời hạn đặt cọc",
        value: "trong 7 ngày",
        semanticStatus: "INFERRED",
        confidence: 0.85,
        evidence: {
          claim: "Tiền cọc cần thanh toán trong 7 ngày sau khi ký",
          status: "INFERRED",
          confidence: 0.85,
          citations: [
            {
              pageNumber: 3,
              sourceText: "Đặt cọc hoàn tất trong vòng 7 ngày kể từ ngày ký hợp đồng.",
            },
          ],
        },
      },
      {
        name: "Kỳ hạn báo trước khi chấm dứt",
        value: "trong tháng này",
        semanticStatus: "UNCERTAIN",
        confidence: 0.5,
        evidence: {
          claim: "Báo trước khi chuyển đi trong tháng này",
          status: "UNCERTAIN",
          confidence: 0.5,
          citations: [],
        },
      },
      {
        name: "Nhiệm vụ bàn giao chìa khóa",
        value: "Bên cho thuê bàn giao đủ chìa khóa và thẻ cư dân",
        semanticStatus: "VERIFIED",
        confidence: 0.92,
        evidence: {
          claim: "Bàn giao chìa khóa tại căn hộ",
          status: "VERIFIED",
          confidence: 0.92,
          citations: [
            {
              pageNumber: 1,
              sourceText: "Bên cho thuê bàn giao đủ chìa khóa và thẻ cư dân vào ngày nhận nhà.",
            },
          ],
        },
      },
    ],
    evidences: [
      {
        claim: "Bên thuê phải mua bảo hiểm cháy nổ cho tài sản",
        status: "VERIFIED",
        confidence: 0.9,
        citations: [
          {
            pageNumber: 4,
            sourceText: "Bên thuê phải mua bảo hiểm cháy nổ theo quy định.",
          },
        ],
        reasoning: "Nghĩa vụ an toàn phòng cháy chữa cháy.",
      },
    ],
    warnings: [],
    provider: "mock-ai",
    model: "mock-v1",
    analyzedAt: new Date().toISOString(),
  }
}

describe("TaskExtractionService Tests", () => {
  let docRepo: DocumentRepository
  let taskRepo: TaskRepository
  let extractionService: TaskExtractionService
  const documentId = "doc-sample-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    taskRepo = new TaskRepository(db)
    extractionService = new TaskExtractionService(taskRepo)
    const analysisRepo = new AnalysisRepository(db)

    const now = new Date().toISOString()
    await docRepo.create({
      id: documentId,
      name: "Hop_dong_thue_nha.pdf",
      originalPath: "/path/Hop_dong_thue_nha.pdf",
      storagePath: "storage/Hop_dong_thue_nha.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      checksum: "chk-contract-1",
      status: "analyzed",
      createdAt: now,
      updatedAt: now,
    })

    await analysisRepo.saveAnalysis({
      id: "analysis-1",
      documentId,
      version: 1,
      isActive: 1,
      status: "completed",
      provider: "mock-ai",
      model: "mock-v1",
      documentType: "CONTRACT",
      summary: "Hợp đồng thuê nhà.",
      rawResult: "{}",
      createdAt: now,
      updatedAt: now,
    })

    await analysisRepo.saveAnalysis({
      id: "analysis-2",
      documentId,
      version: 2,
      isActive: 1,
      status: "completed",
      provider: "mock-ai",
      model: "mock-v1",
      documentType: "CONTRACT",
      summary: "Hợp đồng thuê nhà v2.",
      rawResult: "{}",
      createdAt: now,
      updatedAt: now,
    })
  })

  it("extracts candidate tasks from AnalysisResult fields and evidences", () => {
    const analysis = makeSampleAnalysisResult()
    const candidates = extractionService.extractCandidates(documentId, "analysis-1", 1, analysis)

    expect(candidates.length).toBeGreaterThanOrEqual(4)

    // Exact deadline
    const exactTask = candidates.find((c) => c.title.includes("Hạn thanh toán đợt 1"))
    expect(exactTask).toBeDefined()
    expect(exactTask?.deadlineType).toBe("exact")
    expect(exactTask?.deadlineDate).toBe("2026-09-30")
    expect(exactTask?.semanticStatus).toBe("VERIFIED")
    expect(exactTask?.evidence?.citations[0]?.pageNumber).toBe(2)

    // Relative deadline
    const relTask = candidates.find((c) => c.title.includes("Thời hạn đặt cọc"))
    expect(relTask).toBeDefined()
    expect(relTask?.deadlineType).toBe("relative")
    expect(relTask?.rawDeadline).toContain("trong 7 ngày")
    expect(relTask?.deadlineDate).toBeNull()
    expect(relTask?.semanticStatus).toBe("INFERRED")

    // Ambiguous deadline
    const ambTask = candidates.find((c) => c.title.includes("Kỳ hạn báo trước"))
    expect(ambTask).toBeDefined()
    expect(ambTask?.deadlineType).toBe("ambiguous")
    expect(ambTask?.rawDeadline).toBe("trong tháng này")
    expect(ambTask?.deadlineDate).toBeNull()
    expect(ambTask?.semanticStatus).toBe("UNCERTAIN")

    // Actionable evidence claim
    const evidenceTask = candidates.find((c) => c.title.includes("bảo hiểm cháy nổ"))
    expect(evidenceTask).toBeDefined()
    expect(evidenceTask?.semanticStatus).toBe("VERIFIED")
  })

  it("idempotently saves candidate tasks in pending status", async () => {
    const analysis = makeSampleAnalysisResult()
    const savedFirst = await extractionService.extractAndSaveCandidates(
      documentId,
      "analysis-1",
      1,
      analysis
    )

    expect(savedFirst.length).toBeGreaterThan(0)
    for (const t of savedFirst) {
      expect(t.status).toBe("pending")
    }

    const tasksInDb = await taskRepo.findByDocumentId(documentId)
    expect(tasksInDb.length).toBe(savedFirst.length)

    // Running again on the same analysis does not create duplicate tasks
    const _savedSecond = await extractionService.extractAndSaveCandidates(
      documentId,
      "analysis-1",
      1,
      analysis
    )

    const tasksInDbAfter = await taskRepo.findByDocumentId(documentId)
    expect(tasksInDbAfter.length).toBe(savedFirst.length)
  })

  it("preserves confirmed or rejected status when re-running extraction (critical human authority boundary)", async () => {
    const analysis = makeSampleAnalysisResult()
    const saved = await extractionService.extractAndSaveCandidates(
      documentId,
      "analysis-1",
      1,
      analysis
    )

    const firstTask = saved[0]!
    // User confirms first task with custom edit
    await taskRepo.confirm(firstTask.id, {
      title: "Tiêu đề đã được người dùng chỉnh sửa",
      deadlineDate: "2026-09-29",
    })

    const secondTask = saved[1]!
    // User rejects second task
    await taskRepo.reject(secondTask.id)

    // Re-run extraction for a new analysis version
    await extractionService.extractAndSaveCandidates(
      documentId,
      "analysis-2",
      2,
      analysis
    )

    // Verified: First task is still confirmed with user edits
    const confirmedTask = await taskRepo.findById(firstTask.id)
    expect(confirmedTask?.status).toBe("confirmed")
    expect(confirmedTask?.title).toBe("Tiêu đề đã được người dùng chỉnh sửa")
    expect(confirmedTask?.deadlineDate).toBe("2026-09-29")
    expect(confirmedTask?.userEdited).toBe(1)

    // Verified: Second task is still rejected
    const rejectedTask = await taskRepo.findById(secondTask.id)
    expect(rejectedTask?.status).toBe("rejected")
  })
})
