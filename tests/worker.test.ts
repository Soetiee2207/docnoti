import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentIngestionService } from "@/services/ingestionService"
import { DocumentWorker } from "@/services/worker/documentWorker"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"
import {
  createValidTextPdf,
  createMultiPageTextPdf,
  createEmptyScannedPdf,
} from "./fixtures/samplePdfs"

function createWorkerTestContext() {
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
  const jobRepo = new ProcessingJobRepository(db)
  const pageRepo = new DocumentPageRepository(db)
  const storageService = new InMemoryStorageService()
  const pdfProcessor = new PdfJsProcessor({ minCharsPerPage: 20 })

  const ingestionService = new DocumentIngestionService(
    documentRepo,
    jobRepo,
    storageService
  )

  const worker = new DocumentWorker(
    documentRepo,
    jobRepo,
    pageRepo,
    storageService,
    pdfProcessor
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    pageRepo,
    storageService,
    pdfProcessor,
    ingestionService,
    worker,
  }
}

describe("DocumentWorker & Job Lifecycle Tests", () => {
  it("processes a pending job to completion and stores extracted pages in SQLite", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    // Ingest a valid multi-page PDF
    const { document, job } = await ctx.ingestionService.ingestDocument("C:/sample_multi.pdf")
    const pdfBytes = createMultiPageTextPdf()
    ctx.storageService.setFileBuffer(document.storagePath, pdfBytes)

    // Initial state check
    expect(job.status).toBe("pending")
    expect(document.status).toBe("imported")

    // Worker execution
    const result = await ctx.worker.processJob(job.id)
    expect(result.success).toBe(true)
    expect(result.pageCount).toBe(3)
    expect(result.needsOcr).toBe(false)

    // Verify Job updated
    const updatedJob = await ctx.jobRepo.findById(job.id)
    expect(updatedJob?.status).toBe("completed")
    expect(updatedJob?.startedAt).toBeTruthy()
    expect(updatedJob?.completedAt).toBeTruthy()
    expect(updatedJob?.errorMessage).toBeNull()

    // Verify Document updated
    const updatedDoc = await ctx.documentRepo.findById(document.id)
    expect(updatedDoc?.status).toBe("processed")

    // Verify Pages stored in document_pages with stable page provenance
    const pages = await ctx.pageRepo.findByDocumentId(document.id)
    expect(pages.length).toBe(3)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].textContent).toContain("Trang mot")
    expect(pages[0].hasSufficientText).toBe(1)

    expect(pages[1].pageNumber).toBe(2)
    expect(pages[1].textContent).toContain("Trang hai")

    expect(pages[2].pageNumber).toBe(3)
    expect(pages[2].textContent).toContain("Trang ba")
  })

  it("identifies scanned / blank PDF, updates document to needs_ocr without running OCR", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/scanned.pdf")
    const pdfBytes = createEmptyScannedPdf()
    ctx.storageService.setFileBuffer(document.storagePath, pdfBytes)

    const result = await ctx.worker.processJob(job.id)
    expect(result.success).toBe(true)
    expect(result.needsOcr).toBe(true)

    // Document status must be 'needs_ocr'
    const updatedDoc = await ctx.documentRepo.findById(document.id)
    expect(updatedDoc?.status).toBe("needs_ocr")

    // Job completed the PDF extraction phase
    const updatedJob = await ctx.jobRepo.findById(job.id)
    expect(updatedJob?.status).toBe("completed")

    // Page record exists with hasSufficientText = 0
    const pages = await ctx.pageRepo.findByDocumentId(document.id)
    expect(pages.length).toBe(1)
    expect(pages[0].hasSufficientText).toBe(0)
  })

  it("is idempotent: re-processing the same document replaces pages without duplicates", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/idempotent.pdf")
    const pdfBytes = createValidTextPdf()
    ctx.storageService.setFileBuffer(document.storagePath, pdfBytes)

    // First run
    await ctx.worker.processJob(job.id)
    const pagesAfterFirst = await ctx.pageRepo.findByDocumentId(document.id)
    expect(pagesAfterFirst.length).toBe(1)

    // Reset job to pending for re-run test
    await ctx.jobRepo.updateStatus(job.id, "pending")

    // Second run
    await ctx.worker.processJob(job.id)
    const pagesAfterSecond = await ctx.pageRepo.findByDocumentId(document.id)
    expect(pagesAfterSecond.length).toBe(1) // Still exactly 1 page, no duplication!
  })

  it("handles missing file with bounded retry and marks failed after maxRetries", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/missing.pdf")
    // Note: Do NOT set file buffer in storage -> readFile will throw!

    // Attempt 1: maxRetries is 3
    const res1 = await ctx.worker.processJob(job.id)
    expect(res1.success).toBe(false)
    let currentJob = await ctx.jobRepo.findById(job.id)
    expect(currentJob?.retryCount).toBe(1)
    expect(currentJob?.status).toBe("pending") // Scheduled for retry

    // Attempt 2
    const res2 = await ctx.worker.processJob(job.id)
    expect(res2.success).toBe(false)
    currentJob = await ctx.jobRepo.findById(job.id)
    expect(currentJob?.retryCount).toBe(2)
    expect(currentJob?.status).toBe("pending")

    // Attempt 3: retryCount reaches 3 == maxRetries -> must fail!
    const res3 = await ctx.worker.processJob(job.id)
    expect(res3.success).toBe(false)
    currentJob = await ctx.jobRepo.findById(job.id)
    expect(currentJob?.retryCount).toBe(3)
    expect(currentJob?.status).toBe("failed")
    expect(currentJob?.errorMessage).toContain("File not found")

    // Document status must also be marked 'failed'
    const updatedDoc = await ctx.documentRepo.findById(document.id)
    expect(updatedDoc?.status).toBe("failed")
  })

  it("prevents concurrent execution on the same job", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/concurrent.pdf")
    const pdfBytes = createValidTextPdf()
    ctx.storageService.setFileBuffer(document.storagePath, pdfBytes)

    // Manually transition job to processing
    await ctx.jobRepo.claimJob(job.id)

    // Another worker/thread trying to claim the same job will be rejected
    const secondClaim = await ctx.jobRepo.claimJob(job.id)
    expect(secondClaim).toBeNull()

    const processAttempt = await ctx.worker.processJob(job.id)
    expect(processAttempt.success).toBe(false)
    expect(processAttempt.error).toContain("Không thể nhận job")
  })

  it("processPendingJobs processes all pending jobs sequentially", async () => {
    const ctx = createWorkerTestContext()
    await runMigrations(ctx.executor)

    const doc1 = await ctx.ingestionService.ingestDocument("C:/batch1.pdf")
    const doc2 = await ctx.ingestionService.ingestDocument("C:/batch2.pdf")

    ctx.storageService.setFileBuffer(doc1.document.storagePath, createValidTextPdf())
    ctx.storageService.setFileBuffer(doc2.document.storagePath, createValidTextPdf())

    const results = await ctx.worker.processPendingJobs()
    expect(results.length).toBe(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)

    const remainingPending = await ctx.jobRepo.findPendingJobs()
    expect(remainingPending.length).toBe(0)
  })
})
