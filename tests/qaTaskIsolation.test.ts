import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { DocumentChunkEmbeddingRepository } from "@/repositories/documentChunkEmbeddingRepository"
import { AnalysisRepository } from "@/repositories/analysisRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import { FtsSearchService } from "@/services/search/ftsSearchService"
import { DeterministicEmbeddingProvider } from "@/services/embedding/deterministicEmbeddingProvider"
import { HybridRetrievalService } from "@/services/retrieval/hybridRetrievalService"
import { AnalysisService } from "@/services/ai/analysisService"
import { TaskExtractionService } from "@/services/tasks/taskExtractionService"
import type { AIProvider, AnalysisRequest, AnalysisResult } from "@/services/ai/types"
import type { NewDocumentRecord, NewDocumentPageRecord } from "@/db/schema"

class ControllableMockAIProvider implements AIProvider {
  name = "controllable-mock"
  model = "mock-v1"

  public qaResponse: Partial<AnalysisResult> = {}
  public summaryResponse: Partial<AnalysisResult> = {}

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const isQa = request.options?.isRetrievalGrounded || Boolean(request.options?.query)
    const now = new Date().toISOString()

    if (isQa) {
      return {
        documentId: request.documentId,
        documentType: "OTHER",
        summary:
          this.qaResponse.summary ||
          "Nhập điểm cuối kỳ - Giáo viên bộ môn - 15/10/2026;\nKiểm tra và xác nhận điểm - Giáo viên chủ nhiệm - 18/10/2026;\nNộp báo cáo lớp - Giáo viên chủ nhiệm - 20/10/2026;\nĐối chiếu dữ liệu - Phòng Đào tạo - 23/10/2026.",
        fields: this.qaResponse.fields || [],
        tasks: this.qaResponse.tasks || [],
        evidences: this.qaResponse.evidences || [
          {
            claim: "Các công việc, người phụ trách và deadline được liệt kê.",
            status: "VERIFIED",
            confidence: 0.95,
            citations: [
              {
                pageNumber: 1,
                sourceText: "Hoàn thành trước 15/10/2026.",
              },
            ],
          },
        ],
        warnings: [],
        provider: this.name,
        model: this.model,
        analyzedAt: now,
      }
    }

    return {
      documentId: request.documentId,
      documentType: "PLAN",
      summary: "Bảng kế hoạch tiến độ và phân công công việc",
      fields: [],
      tasks: this.summaryResponse.tasks || [
        {
          title: "Nhập điểm cuối kỳ",
          assignee: "Giáo viên bộ môn",
          deadline: "15/10/2026",
          deadlineType: "exact",
          semanticStatus: "VERIFIED",
          confidence: 0.98,
        },
        {
          title: "Kiểm tra và xác nhận điểm",
          assignee: "Giáo viên chủ nhiệm",
          deadline: "18/10/2026",
          deadlineType: "exact",
          semanticStatus: "VERIFIED",
          confidence: 0.95,
        },
        {
          title: "Nộp báo cáo lớp",
          assignee: "Giáo viên chủ nhiệm",
          deadline: "20/10/2026",
          deadlineType: "exact",
          semanticStatus: "VERIFIED",
          confidence: 0.95,
        },
        {
          title: "Đối chiếu dữ liệu",
          assignee: "Phòng Đào tạo",
          deadline: "23/10/2026",
          deadlineType: "exact",
          semanticStatus: "VERIFIED",
          confidence: 0.95,
        },
      ],
      evidences: [],
      warnings: [],
      provider: this.name,
      model: this.model,
      analyzedAt: now,
    }
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}

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

  const documentRepo = new DocumentRepository(db)
  const pageRepo = new DocumentPageRepository(db)
  const chunkRepo = new DocumentChunkRepository(db)
  const embeddingRepo = new DocumentChunkEmbeddingRepository(db)
  const analysisRepo = new AnalysisRepository(db)
  const taskRepo = new TaskRepository(db)
  const ftsRepo = new FtsSearchRepository(db)
  const ftsService = new FtsSearchService(ftsRepo)
  const embeddingProvider = new DeterministicEmbeddingProvider()
  const hybridRetrievalService = new HybridRetrievalService(
    ftsService,
    embeddingRepo,
    embeddingProvider
  )
  const aiProvider = new ControllableMockAIProvider()
  const taskExtractionService = new TaskExtractionService(taskRepo)

  const analysisService = new AnalysisService({
    aiProvider,
    documentRepo,
    pageRepo,
    analysisRepo,
    hybridRetrievalService,
    taskExtractionService,
  })

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    pageRepo,
    chunkRepo,
    embeddingRepo,
    analysisRepo,
    taskRepo,
    ftsRepo,
    ftsService,
    embeddingProvider,
    hybridRetrievalService,
    aiProvider,
    taskExtractionService,
    analysisService,
  }
}

async function seedDocument(ctx: ReturnType<typeof createTestContext>) {
  const docId = `doc-test-${Date.now()}`
  const now = new Date().toISOString()

  const doc: NewDocumentRecord = {
    id: docId,
    name: "02_bang_cong_viec_deadline.pdf",
    originalPath: "C:/docs/02_bang_cong_viec_deadline.pdf",
    storagePath: "storage/02_bang_cong_viec_deadline.pdf",
    fileSize: 2048,
    mimeType: "application/pdf",
    checksum: "checksum-02",
    status: "processed",
    createdAt: now,
    updatedAt: now,
  }
  await ctx.documentRepo.create(doc)

  const pageText =
    "BẢNG PHÂN CÔNG CÔNG VIỆC: 1. Nhập điểm cuối kỳ - GV bộ môn - 15/10/2026. 2. Kiểm tra điểm - GVCN - 18/10/2026. 3. Nộp báo cáo - GVCN - 20/10/2026. 4. Đối chiếu dữ liệu - PĐT - 23/10/2026."

  const page: NewDocumentPageRecord = {
    id: `page-${docId}-1`,
    documentId: docId,
    pageNumber: 1,
    textContent: pageText,
    charCount: pageText.length,
    hasSufficientText: 1,
    createdAt: now,
    updatedAt: now,
  }
  await ctx.pageRepo.savePages(docId, [page])

  const chunkId = `chunk-${docId}-1`
  ctx.sqlite
    .prepare(
      `INSERT INTO document_chunks (id, document_id, page_number, chunk_index, content, char_start, char_end, created_at, updated_at) VALUES (?, ?, 1, 0, ?, 0, ?, ?, ?)`
    )
    .run(chunkId, docId, pageText, pageText.length, now, now)

  const embVector = await ctx.embeddingProvider.embedText(pageText)
  ctx.sqlite
    .prepare(
      `INSERT INTO document_chunk_embeddings (id, chunk_id, document_id, model, dimensions, embedding, created_at, updated_at) VALUES (?, ?, ?, 'deterministic', ?, ?, ?, ?)`
    )
    .run(`emb-${docId}-1`, chunkId, docId, embVector.length, JSON.stringify(embVector), now, now)

  return docId
}

describe("Q&A vs Task Extraction Boundary & Isolation Suite", () => {
  it("TEST A: Q&A does not create tasks when tasks start at 0", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    const docId = await seedDocument(ctx)

    // Initial tasks must be 0
    const initialTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(initialTasks.length).toBe(0)

    // Run Q&A with query
    const qaResult = await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "Hãy liệt kê tất cả công việc, người phụ trách và deadline."
    )

    // Q&A produces answer and evidence
    expect(qaResult.result.summary).toContain("15/10/2026")
    expect(qaResult.result.evidences.length).toBeGreaterThan(0)

    // SQLite tasks must strictly remain 0
    const afterQaTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(afterQaTasks.length).toBe(0)
  })

  it("TEST B: Full analysis creates structured tasks", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    const docId = await seedDocument(ctx)

    // Run Full Analysis
    const fullResult = await ctx.analysisService.analyzeDocument(docId, { mode: "full" })
    expect(fullResult.result.tasks?.length).toBe(4)

    // SQLite tasks must have 4 tasks
    const tasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(tasks.length).toBe(4)

    const titles = tasks.map((t) => t.title)
    expect(titles).toContain("Nhập điểm cuối kỳ")
    expect(titles).toContain("Kiểm tra và xác nhận điểm")
    expect(titles).toContain("Nộp báo cáo lớp")
    expect(titles).toContain("Đối chiếu dữ liệu")

    const dates = tasks.map((t) => t.deadlineDate)
    expect(dates).toContain("2026-10-15")
    expect(dates).toContain("2026-10-18")
    expect(dates).toContain("2026-10-20")
    expect(dates).toContain("2026-10-23")
  })

  it("TEST C & D: Q&A with multiple deadlines after Full Analysis does not leak new tasks", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    const docId = await seedDocument(ctx)

    // Run Full Analysis -> creates 4 tasks
    await ctx.analysisService.analyzeDocument(docId, { mode: "full" })
    const initialTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(initialTasks.length).toBe(4)

    // Run Q&A multiple times with answers containing multiple deadlines and claims
    await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "Deadline của giáo viên bộ môn là khi nào?"
    )
    await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "Tóm tắt tất cả các mốc 15/10/2026, 18/10/2026, 20/10/2026, 23/10/2026"
    )
    await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "Các công việc, người phụ trách và deadline được liệt kê."
    )

    // Assert: Tasks table must STILL have exactly the same 4 tasks, 0 new tasks created
    const afterMultipleQaTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(afterMultipleQaTasks.length).toBe(4)
  })

  it("TEST E: Re-analysis idempotency - running Full Analysis repeatedly does not duplicate tasks", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    const docId = await seedDocument(ctx)

    // First Full Analysis
    await ctx.analysisService.analyzeDocument(docId, { mode: "full" })
    const firstRunTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(firstRunTasks.length).toBe(4)

    // Second Full Analysis (e.g. user clicks Re-analyze)
    await ctx.analysisService.analyzeDocument(docId, { mode: "full", forceRefresh: true })
    const secondRunTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(secondRunTasks.length).toBe(4)

    // Third Full Analysis
    await ctx.analysisService.analyzeDocument(docId, { mode: "full", forceRefresh: true })
    const thirdRunTasks = await ctx.taskRepo.findByDocumentId(docId)
    expect(thirdRunTasks.length).toBe(4)
  })

  it("TEST F: Q&A does not overwrite the active Full Summary in document_analyses", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    const docId = await seedDocument(ctx)

    // Run Full Analysis -> creates active analysis
    const fullRes = await ctx.analysisService.analyzeDocument(docId, { mode: "full" })
    expect(fullRes.record?.isActive).toBe(1)

    const activeBeforeQa = await ctx.analysisRepo.getActiveAnalysis(docId)
    expect(activeBeforeQa?.id).toBe(fullRes.record?.id)
    expect(activeBeforeQa?.summary).toBe("Bảng kế hoạch tiến độ và phân công công việc")

    // Run Q&A
    await ctx.analysisService.analyzeWithRetrieval(docId, "Ai phụ trách nhập điểm?")

    // Active analysis must STILL be the Full Summary, NOT the Q&A answer!
    const activeAfterQa = await ctx.analysisRepo.getActiveAnalysis(docId)
    expect(activeAfterQa?.id).toBe(fullRes.record?.id)
    expect(activeAfterQa?.summary).toBe("Bảng kế hoạch tiến độ và phân công công việc")
  })
})
