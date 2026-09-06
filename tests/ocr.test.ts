import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import * as schema from "../src/db/schema"
import { runMigrations } from "../src/db/migrator"
import { DocumentRepository } from "../src/repositories/documentRepository"
import { ProcessingJobRepository } from "../src/repositories/processingJobRepository"
import { DocumentPageRepository } from "../src/repositories/documentPageRepository"
import { InMemoryStorageService } from "../src/services/storage"
import { PdfJsProcessor } from "../src/services/pdf/pdfJsProcessor"
import { DocumentWorker } from "../src/services/worker/documentWorker"
import { OCRService } from "../src/services/ocr/ocrService"
import { MockOCRProvider } from "../src/services/ocr/mockOcrProvider"
import { CanvasPageRenderer } from "../src/services/ocr/pageRenderer"
import { OCRError } from "../src/services/ocr/types"
import {
  createEmptyScannedPdf,
  createMultiPageScannedPdf,
  createMixedPdf,
} from "./fixtures/samplePdfs"

describe("OCR V1 - Unit & Pipeline Tests", () => {
  let sqliteDb: DatabaseSync
  let drizzleDb: ReturnType<typeof drizzle<typeof schema>>
  let documentRepo: DocumentRepository
  let jobRepo: ProcessingJobRepository
  let pageRepo: DocumentPageRepository
  let storageService: InMemoryStorageService
  let pdfProcessor: PdfJsProcessor
  let pageRenderer: CanvasPageRenderer

  beforeEach(async () => {
    sqliteDb = new DatabaseSync(":memory:")

    await runMigrations({
      async execute(sql: string) {
        sqliteDb.exec(sql)
      },
      async query<T = unknown>(sql: string): Promise<T[]> {
        return sqliteDb.prepare(sql).all() as T[]
      },
    })

    drizzleDb = drizzle(
      async (sql: string, params: unknown[], method: "run" | "all" | "values" | "get") => {
        const stmt = sqliteDb.prepare(sql)
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
      },
      { schema }
    )

    documentRepo = new DocumentRepository(drizzleDb)
    jobRepo = new ProcessingJobRepository(drizzleDb)
    pageRepo = new DocumentPageRepository(drizzleDb)
    storageService = new InMemoryStorageService()
    pdfProcessor = new PdfJsProcessor()
    pageRenderer = new CanvasPageRenderer()
  })

  it("verifies OCRProvider contract and error handling", async () => {
    const mockProvider = new MockOCRProvider({
      available: true,
      customTextByPage: { 1: "Van ban thu nghiem trang 1" },
    })

    expect(await mockProvider.isAvailable()).toBe(true)

    const dummyImage = new Uint8Array([137, 80, 78, 71])
    const res = await mockProvider.recognizePage(dummyImage, 1)

    expect(res.pageNumber).toBe(1)
    expect(res.text).toBe("Van ban thu nghiem trang 1")
    expect(res.confidence).toBeGreaterThan(0.9)
    expect(res.lines).toBeDefined()
    expect(res.lines?.length).toBe(1)

    // Rejects empty image
    await expect(mockProvider.recognizePage(new Uint8Array([]), 1)).rejects.toThrow(OCRError)

    // Unavailable provider
    const unavailableProvider = new MockOCRProvider({ available: false })
    expect(await unavailableProvider.isAvailable()).toBe(false)
    await expect(unavailableProvider.recognizePage(dummyImage, 1)).rejects.toThrow(OCRError)
  })

  it("processes scanned single-page PDF through OCR to completion", async () => {
    const mockOcr = new MockOCRProvider({
      defaultText: "Noi dung giay phep kinh doanh duoc quet tu ban goc nam 2026.",
    })
    const ocrService = new OCRService(mockOcr, pageRenderer)
    const worker = new DocumentWorker(
      documentRepo,
      jobRepo,
      pageRepo,
      storageService,
      pdfProcessor,
      ocrService
    )

    const docId = `doc-scan-${Date.now()}`
    const storagePath = `app_data/documents/${docId}.pdf`
    const now = new Date().toISOString()
    const pdfBytes = createEmptyScannedPdf()
    storageService.setFileBuffer(storagePath, pdfBytes)

    await documentRepo.create({
      id: docId,
      name: "scanned_doc.pdf",
      originalPath: "C:\\scanned.pdf",
      storagePath,
      fileSize: pdfBytes.length,
      mimeType: "application/pdf",
      checksum: "hash_scan_1",
      status: "imported",
      createdAt: now,
      updatedAt: now,
    })

    const initialJob = await jobRepo.create({
      id: `job-pipeline-${docId}`,
      documentId: docId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })

    // Phase 1: PDF text extraction identifies needs_ocr and schedules OCR job
    const phase1Res = await worker.processJob(initialJob.id)
    expect(phase1Res.success).toBe(true)
    expect(phase1Res.needsOcr).toBe(true)

    const docAfterPhase1 = await documentRepo.findById(docId)
    expect(docAfterPhase1?.status).toBe("needs_ocr")

    // Verify OCR job was enqueued
    const allJobs = await jobRepo.findByDocumentId(docId)
    const ocrJob = allJobs.find((j) => j.jobType === "ocr")
    expect(ocrJob).toBeDefined()
    expect(ocrJob?.status).toBe("pending")

    // Phase 2: Worker processes OCR job
    const phase2Res = await worker.processJob(ocrJob!.id)
    expect(phase2Res.success).toBe(true)
    expect(phase2Res.jobType).toBe("ocr")

    // Document must now be processed (no longer needs_ocr!)
    const docAfterOcr = await documentRepo.findById(docId)
    expect(docAfterOcr?.status).toBe("processed")

    // Page must contain the OCR text
    const pages = await pageRepo.findByDocumentId(docId)
    expect(pages.length).toBe(1)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].textContent).toContain("giay phep kinh doanh")
    expect(pages[0].hasSufficientText).toBe(1)
    expect(pages[0].charCount).toBeGreaterThan(30)
  })

  it("handles multi-page scanned PDF with exact page provenance", async () => {
    const mockOcr = new MockOCRProvider({
      customTextByPage: {
        1: "Chuong 1: Quy dinh chung ve quy trinh xu ly ho so dien tu.",
        2: "Chuong 2: Trach nhiem cua can bo tiep nhan va thoi han xu ly.",
        3: "Chuong 3: Dieu khoan thi hanh va hieu luc ap dung tu thang 10.",
      },
    })
    const ocrService = new OCRService(mockOcr, pageRenderer)
    const worker = new DocumentWorker(
      documentRepo,
      jobRepo,
      pageRepo,
      storageService,
      pdfProcessor,
      ocrService
    )

    const docId = `doc-multi-scan-${Date.now()}`
    const storagePath = `app_data/documents/${docId}.pdf`
    const now = new Date().toISOString()
    const pdfBytes = createMultiPageScannedPdf()
    storageService.setFileBuffer(storagePath, pdfBytes)

    await documentRepo.create({
      id: docId,
      name: "multipage_scan.pdf",
      originalPath: "C:\\multi.pdf",
      storagePath,
      fileSize: pdfBytes.length,
      mimeType: "application/pdf",
      checksum: "hash_multi_scan",
      status: "imported",
      createdAt: now,
      updatedAt: now,
    })

    await jobRepo.create({
      id: `job-${docId}`,
      documentId: docId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })

    // Process all pending jobs sequentially
    await worker.processPendingJobs()

    const doc = await documentRepo.findById(docId)
    expect(doc?.status).toBe("processed")

    const pages = await pageRepo.findByDocumentId(docId)
    expect(pages.length).toBe(3)
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].textContent).toContain("Chuong 1")
    expect(pages[1].pageNumber).toBe(2)
    expect(pages[1].textContent).toContain("Chuong 2")
    expect(pages[2].pageNumber).toBe(3)
    expect(pages[2].textContent).toContain("Chuong 3")

    for (const page of pages) {
      expect(page.documentId).toBe(docId)
      expect(page.hasSufficientText).toBe(1)
    }
  })

  it("strictly preserves existing high-quality text from PDF.js (Requirement 3)", async () => {
    const mockOcr = new MockOCRProvider({
      defaultText: "Noi dung truyen sang tu OCR cho trang bi thieu text layer.",
    })
    const ocrService = new OCRService(mockOcr, pageRenderer)
    const worker = new DocumentWorker(
      documentRepo,
      jobRepo,
      pageRepo,
      storageService,
      pdfProcessor,
      ocrService
    )

    const docId = `doc-mixed-${Date.now()}`
    const storagePath = `app_data/documents/${docId}.pdf`
    const now = new Date().toISOString()
    const pdfBytes = createMixedPdf() // Page 1 has valid text, page 2 is blank
    storageService.setFileBuffer(storagePath, pdfBytes)

    await documentRepo.create({
      id: docId,
      name: "mixed_doc.pdf",
      originalPath: "C:\\mixed.pdf",
      storagePath,
      fileSize: pdfBytes.length,
      mimeType: "application/pdf",
      checksum: "hash_mixed",
      status: "imported",
      createdAt: now,
      updatedAt: now,
    })

    await jobRepo.create({
      id: `job-${docId}`,
      documentId: docId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })

    await worker.processPendingJobs()

    const pages = await pageRepo.findByDocumentId(docId)
    expect(pages.length).toBe(2)

    // Page 1's original digital text must NOT be overwritten!
    expect(pages[0].textContent).toContain("Trang mot co day du noi dung van ban hop dong")
    // Page 2 must have received OCR text
    expect(pages[1].textContent).toContain("Noi dung truyen sang tu OCR")
  })

  it("handles OCR failure with bounded retry and terminal failed state", async () => {
    const mockOcr = new MockOCRProvider({
      simulateFailureOnPage: 1,
      failureMessage: "OCR engine bi loi khong the khoi tao mo hinh nhan dang.",
    })
    const ocrService = new OCRService(mockOcr, pageRenderer)
    const worker = new DocumentWorker(
      documentRepo,
      jobRepo,
      pageRepo,
      storageService,
      pdfProcessor,
      ocrService
    )

    const docId = `doc-fail-${Date.now()}`
    const storagePath = `app_data/documents/${docId}.pdf`
    const now = new Date().toISOString()
    const pdfBytes = createEmptyScannedPdf()
    storageService.setFileBuffer(storagePath, pdfBytes)

    await documentRepo.create({
      id: docId,
      name: "failed_ocr_doc.pdf",
      originalPath: "C:\\fail.pdf",
      storagePath,
      fileSize: pdfBytes.length,
      mimeType: "application/pdf",
      checksum: "hash_fail",
      status: "imported",
      createdAt: now,
      updatedAt: now,
    })

    const initialJob = await jobRepo.create({
      id: `job-p1-${docId}`,
      documentId: docId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })

    await worker.processJob(initialJob.id)

    const jobs = await jobRepo.findByDocumentId(docId)
    const ocrJob = jobs.find((j) => j.jobType === "ocr")!
    expect(ocrJob).toBeDefined()

    // Retry 1: Fails, retryCount becomes 1, status remains pending
    const res1 = await worker.processJob(ocrJob.id)
    expect(res1.success).toBe(false)
    const jobAfterR1 = await jobRepo.findById(ocrJob.id)
    expect(jobAfterR1?.status).toBe("pending")
    expect(jobAfterR1?.retryCount).toBe(1)

    // Retry 2: Fails, retryCount becomes 2
    const res2 = await worker.processJob(ocrJob.id)
    expect(res2.success).toBe(false)
    const jobAfterR2 = await jobRepo.findById(ocrJob.id)
    expect(jobAfterR2?.status).toBe("pending")
    expect(jobAfterR2?.retryCount).toBe(2)

    // Retry 3: Fails, retryCount reaches maxRetries (3) -> terminal failed
    const res3 = await worker.processJob(ocrJob.id)
    expect(res3.success).toBe(false)
    const jobAfterR3 = await jobRepo.findById(ocrJob.id)
    expect(jobAfterR3?.status).toBe("failed")

    const finalDoc = await documentRepo.findById(docId)
    expect(finalDoc?.status).toBe("failed")
  })

  it("is idempotent: re-running OCR on same document does not create duplicate rows", async () => {
    const mockOcr = new MockOCRProvider({
      defaultText: "Van ban OCR lan 1",
    })
    const ocrService = new OCRService(mockOcr, pageRenderer)
    const worker = new DocumentWorker(
      documentRepo,
      jobRepo,
      pageRepo,
      storageService,
      pdfProcessor,
      ocrService
    )

    const docId = `doc-idemp-${Date.now()}`
    const storagePath = `app_data/documents/${docId}.pdf`
    const now = new Date().toISOString()
    const pdfBytes = createEmptyScannedPdf()
    storageService.setFileBuffer(storagePath, pdfBytes)

    await documentRepo.create({
      id: docId,
      name: "idemp.pdf",
      originalPath: "C:\\idemp.pdf",
      storagePath,
      fileSize: pdfBytes.length,
      mimeType: "application/pdf",
      checksum: "hash_idemp",
      status: "imported",
      createdAt: now,
      updatedAt: now,
    })

    const initialJob = await jobRepo.create({
      id: `job-init-${docId}`,
      documentId: docId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })

    await worker.processJob(initialJob.id)

    const jobs = await jobRepo.findByDocumentId(docId)
    const ocrJob = jobs.find((j) => j.jobType === "ocr")!
    await worker.processJob(ocrJob.id)

    const pagesFirstPass = await pageRepo.findByDocumentId(docId)
    expect(pagesFirstPass.length).toBe(1)
    expect(pagesFirstPass[0].textContent).toContain("Van ban OCR lan 1")

    // Simulate re-running OCR with updated provider text
    const updatedMockOcr = new MockOCRProvider({
      defaultText: "Van ban OCR cap nhat lan 2",
    })
    worker.setOcrService(new OCRService(updatedMockOcr, pageRenderer))

    // Reset job status to pending to re-run
    await jobRepo.updateStatus(ocrJob.id, "pending")
    await worker.processJob(ocrJob.id)

    const pagesSecondPass = await pageRepo.findByDocumentId(docId)
    expect(pagesSecondPass.length).toBe(1) // Still exactly 1 row! No duplicate!
    expect(pagesSecondPass[0].textContent).toContain("Van ban OCR cap nhat lan 2")
  })
})
