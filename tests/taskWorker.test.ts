import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { AnalysisRepository } from "@/repositories/analysisRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { TaskExtractionService } from "@/services/tasks/taskExtractionService"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentWorker } from "@/services/worker/documentWorker"
import { AnalysisService } from "@/services/ai/analysisService"
import { MockAIProvider } from "@/services/ai/mockAIProvider"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"

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

describe("DocumentWorker & Task Extraction Integration", () => {
  let docRepo: DocumentRepository
  let jobRepo: ProcessingJobRepository
  let pageRepo: DocumentPageRepository
  let analysisRepo: AnalysisRepository
  let taskRepo: TaskRepository
  let taskExtractionService: TaskExtractionService
  let worker: DocumentWorker

  const documentId = "doc-worker-task-1"

  beforeEach(async () => {
    const { executor, db } = createTestContext()
    await runMigrations(executor)

    docRepo = new DocumentRepository(db)
    jobRepo = new ProcessingJobRepository(db)
    pageRepo = new DocumentPageRepository(db)
    analysisRepo = new AnalysisRepository(db)
    taskRepo = new TaskRepository(db)
    taskExtractionService = new TaskExtractionService(taskRepo)

    const storage = new InMemoryStorageService()
    const pdfProcessor = new PdfJsProcessor()

    const mockAi = new MockAIProvider({
      simulatedClassification: "INVOICE",
      simulatedSummary: "Hóa đơn dịch vụ",
      simulatedFields: [
        {
          name: "Thời hạn thanh toán",
          value: "25/09/2026",
          semanticStatus: "VERIFIED",
          confidence: 0.95,
          evidence: {
            claim: "Thời hạn thanh toán trước ngày 25/09/2026.",
            status: "VERIFIED",
            confidence: 0.95,
            citations: [
              {
                pageNumber: 1,
                sourceText: "Thời hạn thanh toán trước ngày 25/09/2026.",
              },
            ],
          },
        },
      ],
    })

    const analysisService = new AnalysisService({
      aiProvider: mockAi,
      documentRepo: docRepo,
      pageRepo: pageRepo,
      analysisRepo: analysisRepo,
    })

    worker = new DocumentWorker(
      docRepo,
      jobRepo,
      pageRepo,
      storage,
      pdfProcessor,
      undefined,
      analysisService,
      false,
      undefined,
      undefined,
      taskExtractionService
    )

    const now = new Date().toISOString()
    await docRepo.create({
      id: documentId,
      name: "Hoa_don_dich_vu.pdf",
      originalPath: "/path/Hoa_don_dich_vu.pdf",
      storagePath: "storage/Hoa_don_dich_vu.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      checksum: "chk-inv-1",
      status: "processed",
      createdAt: now,
      updatedAt: now,
    })

    await pageRepo.savePages(documentId, [
      {
        id: `${documentId}_p1`,
        documentId,
        pageNumber: 1,
        textContent: "HÓA ĐƠN DỊCH VỤ\nThời hạn thanh toán trước ngày 25/09/2026.",
        charCount: 60,
        hasSufficientText: 1,
        createdAt: now,
        updatedAt: now,
      },
    ])
  })

  it("automatically extracts candidate tasks into tasks table in pending status after analysis job completes", async () => {
    // Enqueue and run analysis job
    const job = await worker.enqueueAnalysisJob(documentId)
    expect(job.status).toBe("pending")

    const res = await worker.processJob(job.id)
    expect(res.success).toBe(true)
    expect(res.jobType).toBe("analysis")

    // Document transitioned to analyzed
    const doc = await docRepo.findById(documentId)
    expect(doc?.status).toBe("analyzed")

    // Tasks table has extracted pending tasks
    const tasks = await taskRepo.findByDocumentId(documentId)
    expect(tasks.length).toBeGreaterThanOrEqual(1)

    const firstTask = tasks[0]!
    expect(firstTask.status).toBe("pending")
    expect(firstTask.documentId).toBe(documentId)
    expect(firstTask.confirmedAt).toBeNull()

    // Safety boundary: No calendar or notification side effects exist
    expect(firstTask.status).not.toBe("confirmed")
  })
})
