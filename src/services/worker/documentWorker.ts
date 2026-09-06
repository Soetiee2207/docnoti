import type { DocumentRepository } from "@/repositories/documentRepository"
import type { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import type { DocumentPageRepository } from "@/repositories/documentPageRepository"
import type { StorageService } from "@/services/storage"
import type { PDFProcessor, PDFProcessingResult } from "@/services/pdf/types"
import type { OCRService } from "@/services/ocr/ocrService"
import type { ProcessingJobRecord } from "@/db/schema"

export interface WorkerJobResult {
  jobId: string
  documentId: string
  success: boolean
  jobType?: string
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
  private ocrService?: OCRService
  private isRunning = false

  constructor(
    documentRepo: DocumentRepository,
    jobRepo: ProcessingJobRepository,
    pageRepo: DocumentPageRepository,
    storageService: StorageService,
    pdfProcessor: PDFProcessor,
    ocrService?: OCRService
  ) {
    this.documentRepo = documentRepo
    this.jobRepo = jobRepo
    this.pageRepo = pageRepo
    this.storageService = storageService
    this.pdfProcessor = pdfProcessor
    this.ocrService = ocrService
  }

  /**
   * Set or update the OCR service on this worker
   */
  setOcrService(ocrService: OCRService): void {
    this.ocrService = ocrService
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
    const jobType = claimedJob.jobType || "document_pipeline"

    try {
      if (jobType === "ocr") {
        return await this.processOcrJob(claimedJob)
      } else {
        return await this.processPdfJob(claimedJob)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`DocumentWorker job ${jobId} (${jobType}) failed:`, errorMessage)

      // Bounded retry handling
      const retryResult = await this.jobRepo.failOrRetry(jobId, errorMessage)
      if (!retryResult.retrying) {
        // Retries exhausted, mark document as failed
        await this.documentRepo.updateStatus(documentId, "failed")
      } else if (jobType === "ocr") {
        // While retrying OCR, retain needs_ocr status on document
        await this.documentRepo.updateStatus(documentId, "needs_ocr")
      }

      return {
        jobId,
        documentId,
        jobType,
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Execute PDF text extraction job
   */
  private async processPdfJob(job: ProcessingJobRecord): Promise<WorkerJobResult> {
    const jobId = job.id
    const documentId = job.documentId

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

    // Step 6: Update document status and handle OCR pipeline transition
    if (processingResult.needsOcr) {
      // Insufficient or blank text: mark as needs_ocr
      await this.documentRepo.updateStatus(documentId, "needs_ocr")

      // Enqueue persistent OCR job if OCR service is configured
      const ocrJobId = `job-ocr-${documentId}-${Date.now()}`
      await this.jobRepo.create({
        id: ocrJobId,
        documentId,
        jobType: "ocr",
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      // Sufficient text extracted
      await this.documentRepo.updateStatus(documentId, "processed")
    }

    // Step 7: Mark current job as completed
    await this.jobRepo.updateStatus(jobId, "completed")

    return {
      jobId,
      documentId,
      jobType: "document_pipeline",
      success: true,
      needsOcr: processingResult.needsOcr,
      pageCount: processingResult.pages.length,
    }
  }

  /**
   * Execute OCR job on documents marked needs_ocr
   */
  private async processOcrJob(job: ProcessingJobRecord): Promise<WorkerJobResult> {
    const jobId = job.id
    const documentId = job.documentId

    if (!this.ocrService) {
      throw new Error("OCRService chưa được cấu hình cho DocumentWorker.")
    }

    // Step 1: Update document status to processing
    await this.documentRepo.updateStatus(documentId, "processing")

    // Step 2: Fetch document
    const document = await this.documentRepo.findById(documentId)
    if (!document) {
      throw new Error(`Tài liệu với ID ${documentId} không tồn tại trong cơ sở dữ liệu.`)
    }

    // Step 3: Fetch existing document pages
    const existingPages = await this.pageRepo.findByDocumentId(documentId)
    if (existingPages.length === 0) {
      throw new Error(`Không tìm thấy trang nào cho tài liệu ${documentId} để chạy OCR.`)
    }

    // Step 4: Read binary PDF from managed storage
    const fileBytes = await this.storageService.readFile(document.storagePath)

    // Step 5: Run OCR on pages requiring text
    const ocrResult = await this.ocrService.processDocumentPages(
      documentId,
      fileBytes,
      existingPages
    )

    // Step 6: Idempotently update document_pages with OCR text
    for (const pageRes of ocrResult.pages) {
      const pageId = `${documentId}_p${pageRes.pageNumber}`
      const hasSufficient = pageRes.text.trim().length >= 30 ? 1 : 0
      await this.pageRepo.updatePage(
        pageId,
        pageRes.text,
        pageRes.text.length,
        hasSufficient
      )
    }

    // Step 7: Document is no longer needs_ocr; transition to processed (ready for analysis)
    await this.documentRepo.updateStatus(documentId, "processed")

    // Step 8: Mark OCR job as completed
    await this.jobRepo.updateStatus(jobId, "completed")

    return {
      jobId,
      documentId,
      jobType: "ocr",
      success: true,
      needsOcr: false,
      pageCount: ocrResult.pages.length,
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
    const processedJobIds = new Set<string>()

    try {
      while (true) {
        const pendingJobs: ProcessingJobRecord[] = await this.jobRepo.findPendingJobs()
        const unhandledJobs = pendingJobs.filter((j) => !processedJobIds.has(j.id))
        if (unhandledJobs.length === 0) {
          break
        }

        for (const job of unhandledJobs) {
          processedJobIds.add(job.id)
          const res = await this.processJob(job.id)
          results.push(res)
        }
      }
    } finally {
      this.isRunning = false
    }

    return results
  }
}
