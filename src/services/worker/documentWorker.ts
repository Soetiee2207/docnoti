import type { DocumentRepository } from "@/repositories/documentRepository"
import type { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import type { DocumentPageRepository } from "@/repositories/documentPageRepository"
import type { StorageService } from "@/services/storage"
import type { PDFProcessor, PDFProcessingResult } from "@/services/pdf/types"
import type { ProcessingJobRecord } from "@/db/schema"

export interface WorkerJobResult {
  jobId: string
  documentId: string
  success: boolean
  needsOcr?: boolean
  pageCount?: number
  error?: string
}

export class DocumentWorker {
  private documentRepo: DocumentRepository
  private jobRepo: ProcessingJobRepository
  private pageRepo: DocumentPageRepository
  private storageService: StorageService
  private pdfProcessor: PDFProcessor
  private isRunning = false

  constructor(
    documentRepo: DocumentRepository,
    jobRepo: ProcessingJobRepository,
    pageRepo: DocumentPageRepository,
    storageService: StorageService,
    pdfProcessor: PDFProcessor
  ) {
    this.documentRepo = documentRepo
    this.jobRepo = jobRepo
    this.pageRepo = pageRepo
    this.storageService = storageService
    this.pdfProcessor = pdfProcessor
  }

  /**
   * Process a specific processing job by ID.
   * Concurrency-safe: claims job atomically before processing.
   */
  async processJob(jobId: string): Promise<WorkerJobResult> {
    // Attempt to atomically claim the job
    const claimedJob = await this.jobRepo.claimJob(jobId)
    if (!claimedJob) {
      return {
        jobId,
        documentId: "",
        success: false,
        error: "Không thể nhận job (job không ở trạng thái pending hoặc đang được xử lý).",
      }
    }

    const documentId = claimedJob.documentId

    try {
      // Step 1: Update document status to processing
      await this.documentRepo.updateStatus(documentId, "processing")

      // Step 2: Fetch document to get storagePath
      const document = await this.documentRepo.findById(documentId)
      if (!document) {
        throw new Error(`Tài liệu với ID ${documentId} không tồn tại trong cơ sở dữ liệu.`)
      }

      // Step 3: Read binary data from managed local storage
      const fileBytes = await this.storageService.readFile(document.storagePath)

      // Step 4: Parse PDF using the PDFProcessor abstraction
      const processingResult: PDFProcessingResult = await this.pdfProcessor.process(fileBytes)

      // Step 5: Persist extracted pages idempotently into SQLite
      const now = new Date().toISOString()
      const pageRecords = processingResult.pages.map((p) => ({
        id: `${documentId}_p${p.pageNumber}`,
        documentId,
        pageNumber: p.pageNumber,
        textContent: p.text,
        charCount: p.charCount,
        hasSufficientText: p.hasSufficientText ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      }))

      await this.pageRepo.savePages(documentId, pageRecords)

      // Step 6: Update document status according to OCR boundary
      if (processingResult.needsOcr) {
        // Insufficient or blank text: mark as needs_ocr for downstream OCR worker
        await this.documentRepo.updateStatus(documentId, "needs_ocr")
      } else {
        // Sufficient text extracted
        await this.documentRepo.updateStatus(documentId, "processed")
      }

      // Step 7: Mark job as completed
      await this.jobRepo.updateStatus(jobId, "completed")

      return {
        jobId,
        documentId,
        success: true,
        needsOcr: processingResult.needsOcr,
        pageCount: processingResult.pages.length,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`DocumentWorker job ${jobId} failed:`, errorMessage)

      // Step 8: Bounded retry handling
      const retryResult = await this.jobRepo.failOrRetry(jobId, errorMessage)
      if (!retryResult.retrying) {
        // Retries exhausted, mark document as failed
        await this.documentRepo.updateStatus(documentId, "failed")
      }

      return {
        jobId,
        documentId,
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Process all currently pending jobs in sequential order
   */
  async processPendingJobs(): Promise<WorkerJobResult[]> {
    if (this.isRunning) {
      return []
    }

    this.isRunning = true
    const results: WorkerJobResult[] = []

    try {
      const pendingJobs: ProcessingJobRecord[] = await this.jobRepo.findPendingJobs()
      for (const job of pendingJobs) {
        const res = await this.processJob(job.id)
        results.push(res)
      }
    } finally {
      this.isRunning = false
    }

    return results
  }
}
