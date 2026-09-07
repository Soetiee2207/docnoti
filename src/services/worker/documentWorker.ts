import type { DocumentRepository } from "@/repositories/documentRepository"
import type { ProcessingJobRepository, StaleJobRecoveryResult } from "@/repositories/processingJobRepository"
import type { DocumentPageRepository } from "@/repositories/documentPageRepository"
import type { StorageService } from "@/services/storage"
import type { PDFProcessor, PDFProcessingResult } from "@/services/pdf/types"
import type { OCRService } from "@/services/ocr/ocrService"
import type { AnalysisService } from "@/services/ai/analysisService"
import type { ChunkingService } from "@/services/chunking"
import type { EmbeddingService } from "@/services/embedding"
import type { TaskExtractionService } from "@/services/tasks"
import { AIError } from "@/services/ai/types"
import { EmbeddingError } from "@/services/embedding"
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

export interface DocumentWorkerOptions {
  workerId?: string
  leaseDurationMs?: number
  heartbeatIntervalMs?: number
}

export class DocumentWorker {
  private documentRepo: DocumentRepository
  private jobRepo: ProcessingJobRepository
  private pageRepo: DocumentPageRepository
  private storageService: StorageService
  private pdfProcessor: PDFProcessor
  private ocrService?: OCRService
  private analysisService?: AnalysisService
  private chunkingService?: ChunkingService
  private embeddingService?: EmbeddingService
  private taskExtractionService?: TaskExtractionService
  private autoAnalyze: boolean = false
  private isRunning = false
  private backgroundTimer: NodeJS.Timeout | null = null

  readonly workerId: string
  readonly leaseDurationMs: number
  readonly heartbeatIntervalMs: number

  constructor(
    documentRepo: DocumentRepository,
    jobRepo: ProcessingJobRepository,
    pageRepo: DocumentPageRepository,
    storageService: StorageService,
    pdfProcessor: PDFProcessor,
    ocrService?: OCRService,
    analysisService?: AnalysisService,
    autoAnalyze: boolean = false,
    chunkingService?: ChunkingService,
    embeddingService?: EmbeddingService,
    taskExtractionService?: TaskExtractionService,
    options?: DocumentWorkerOptions
  ) {
    this.documentRepo = documentRepo
    this.jobRepo = jobRepo
    this.pageRepo = pageRepo
    this.storageService = storageService
    this.pdfProcessor = pdfProcessor
    this.ocrService = ocrService
    this.analysisService = analysisService
    this.autoAnalyze = autoAnalyze
    this.chunkingService = chunkingService
    this.embeddingService = embeddingService
    this.taskExtractionService = taskExtractionService

    this.workerId = options?.workerId ?? `worker-${Math.random().toString(36).substring(2, 10)}`
    this.leaseDurationMs = options?.leaseDurationMs ?? 5 * 60 * 1000
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 60 * 1000
  }

  /**
   * Set or update the TaskExtraction service on this worker
   */
  setTaskExtractionService(taskExtractionService: TaskExtractionService): void {
    this.taskExtractionService = taskExtractionService
  }

  /**
   * Set or update the OCR service on this worker
   */
  setOcrService(ocrService: OCRService): void {
    this.ocrService = ocrService
  }

  /**
   * Set or update the Analysis service on this worker
   */
  setAnalysisService(analysisService: AnalysisService): void {
    this.analysisService = analysisService
  }

  /**
   * Set or update the Chunking service on this worker
   */
  setChunkingService(chunkingService: ChunkingService): void {
    this.chunkingService = chunkingService
  }

  /**
   * Set or update the Embedding service on this worker
   */
  setEmbeddingService(embeddingService: EmbeddingService): void {
    this.embeddingService = embeddingService
  }


  /**
   * Configure whether processed documents automatically transition to analysis
   */
  setAutoAnalyze(autoAnalyze: boolean): void {
    this.autoAnalyze = autoAnalyze
  }

  /**
   * Idempotently enqueues an analysis job for a document.
   * If an analysis job is already pending or processing, returns that job instead of creating a duplicate.
   */
  async enqueueAnalysisJob(documentId: string): Promise<ProcessingJobRecord> {
    const document = await this.documentRepo.findById(documentId)
    if (!document) {
      throw new Error(`Tài liệu với ID ${documentId} không tồn tại.`)
    }

    // Idempotency: Check if an analysis job is already active
    const existingJobs = await this.jobRepo.findByDocumentId(documentId)
    const activeJob = existingJobs.find(
      (j) => j.jobType === "analysis" && (j.status === "pending" || j.status === "processing")
    )
    if (activeJob) {
      return activeJob
    }

    const now = new Date().toISOString()
    const jobId = `job-analysis-${documentId}-${Date.now()}`
    return this.jobRepo.create({
      id: jobId,
      documentId,
      jobType: "analysis",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })
  }

  /**
   * Idempotently enqueues an embedding job for a document.
   * If an embedding job is already pending or processing, returns that job instead of creating a duplicate.
   */
  async enqueueEmbeddingJob(documentId: string): Promise<ProcessingJobRecord> {
    const document = await this.documentRepo.findById(documentId)
    if (!document) {
      throw new Error(`Tài liệu với ID ${documentId} không tồn tại.`)
    }

    const existingJobs = await this.jobRepo.findByDocumentId(documentId)
    const activeJob = existingJobs.find(
      (j) => j.jobType === "embedding" && (j.status === "pending" || j.status === "processing")
    )
    if (activeJob) {
      return activeJob
    }

    const now = new Date().toISOString()
    const jobId = `job-embed-${documentId}-${Date.now()}`
    return this.jobRepo.create({
      id: jobId,
      documentId,
      jobType: "embedding",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })
  }

  /**
   * Re-enqueues a document_pipeline job for a document, allowing users to reprocess failed documents.
   */
  async reprocessDocument(documentId: string): Promise<ProcessingJobRecord> {
    const document = await this.documentRepo.findById(documentId)
    if (!document) {
      throw new Error(`Tài liệu với ID ${documentId} không tồn tại.`)
    }

    const now = new Date().toISOString()
    await this.documentRepo.updateStatus(documentId, "processing")

    const jobId = `job-retry-${documentId}-${Date.now()}`
    return this.jobRepo.create({
      id: jobId,
      documentId,
      jobType: "document_pipeline",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    })
  }


  /**
   * Process a specific processing job by ID.
   * Concurrency-safe: claims job atomically before processing.
   */
  async processJob(jobId: string): Promise<WorkerJobResult> {
    // Attempt to atomically claim the job with ownership lease
    const claimedJob = await this.jobRepo.claimJob(jobId, this.workerId, this.leaseDurationMs)
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

    // Start background lease renewal heartbeat while job is processing
    const heartbeatTimer = setInterval(() => {
      void this.jobRepo.heartbeat(jobId, this.workerId, this.leaseDurationMs)
    }, this.heartbeatIntervalMs)

    try {
      if (jobType === "ocr") {
        return await this.processOcrJob(claimedJob)
      } else if (jobType === "analysis") {
        return await this.processAnalysisJob(claimedJob)
      } else if (jobType === "embedding") {
        return await this.processEmbeddingJob(claimedJob)
      } else {
        return await this.processPdfJob(claimedJob)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`DocumentWorker job ${jobId} (${jobType}) failed:`, errorMessage)

      // Do not retry non-retryable AI or Embedding errors
      const isNonRetryable =
        (err instanceof AIError && !err.retryable) ||
        (err instanceof EmbeddingError && !err.retryable)

      if (isNonRetryable) {
        await this.jobRepo.updateStatus(jobId, "failed", errorMessage)
        if (jobType === "analysis") {
          await this.documentRepo.updateStatus(documentId, "analysis_failed")
        } else if (jobType !== "embedding") {
          await this.documentRepo.updateStatus(documentId, "failed")
        }
        return {
          jobId,
          documentId,
          jobType,
          success: false,
          error: errorMessage,
        }
      }

      // Bounded retry handling
      const retryResult = await this.jobRepo.failOrRetry(jobId, errorMessage)
      if (!retryResult.retrying) {
        // Retries exhausted
        if (jobType === "analysis") {
          await this.documentRepo.updateStatus(documentId, "analysis_failed")
        } else if (jobType !== "embedding") {
          await this.documentRepo.updateStatus(documentId, "failed")
        }
        // Invariant: Embedding failure does not make document unusable
      } else if (jobType === "ocr") {
        // While retrying OCR, retain needs_ocr status on document
        await this.documentRepo.updateStatus(documentId, "needs_ocr")
      } else if (jobType === "analysis") {
        // While retrying analysis, keep status as processed
        await this.documentRepo.updateStatus(documentId, "processed")
      }


      return {
        jobId,
        documentId,
        jobType,
        success: false,
        error: errorMessage,
      }
    } finally {
      clearInterval(heartbeatTimer)
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

      // Enqueue persistent OCR job if OCR service is configured and not already active
      const existingJobs = await this.jobRepo.findByDocumentId(documentId)
      const activeOcrJob = existingJobs.find(
        (j) => j.jobType === "ocr" && (j.status === "pending" || j.status === "processing")
      )
      if (!activeOcrJob) {
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
      }
    } else {
      // Sufficient text extracted: chunk finalized pages if chunkingService is configured
      if (this.chunkingService) {
        await this.chunkingService.chunkAndSave(documentId)
      }
      await this.documentRepo.updateStatus(documentId, "processed")
      if (this.embeddingService) {
        await this.enqueueEmbeddingJob(documentId)
      }
      if (this.autoAnalyze && this.analysisService) {
        await this.enqueueAnalysisJob(documentId)
      }
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

    // Step 7: Document is no longer needs_ocr; chunk finalized pages and transition to processed
    if (this.chunkingService) {
      await this.chunkingService.chunkAndSave(documentId)
    }
    await this.documentRepo.updateStatus(documentId, "processed")
    if (this.embeddingService) {
      await this.enqueueEmbeddingJob(documentId)
    }
    if (this.autoAnalyze && this.analysisService) {
      await this.enqueueAnalysisJob(documentId)
    }


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
   * Execute analysis job on processed document
   */
  private async processAnalysisJob(job: ProcessingJobRecord): Promise<WorkerJobResult> {
    const jobId = job.id
    const documentId = job.documentId

    if (!this.analysisService) {
      throw new Error("AnalysisService chưa được cấu hình cho DocumentWorker.")
    }

    // Step 1: Update document status to analyzing
    await this.documentRepo.updateStatus(documentId, "analyzing")

    // Step 2: Execute analysis pipeline
    const analysisRes = await this.analysisService.analyzeDocument(documentId)

    // Step 2.1: Extract candidate tasks idempotently if taskExtractionService is available
    if (this.taskExtractionService && analysisRes?.result) {
      try {
        await this.taskExtractionService.extractAndSaveCandidates(
          documentId,
          analysisRes.record?.id,
          analysisRes.record?.version,
          analysisRes.result
        )
      } catch (extractErr) {
        console.warn(`[Worker] Task candidate extraction warning for document ${documentId}:`, extractErr)
      }
    }

    // Step 3: Transition document to analyzed
    await this.documentRepo.updateStatus(documentId, "analyzed")

    // Step 4: Mark job as completed
    await this.jobRepo.updateStatus(jobId, "completed")

    return {
      jobId,
      documentId,
      jobType: "analysis",
      success: true,
    }
  }

  /**
   * Execute embedding job on chunked document
   */
  private async processEmbeddingJob(job: ProcessingJobRecord): Promise<WorkerJobResult> {
    const jobId = job.id
    const documentId = job.documentId

    if (!this.embeddingService) {
      throw new Error("EmbeddingService chưa được cấu hình cho DocumentWorker.")
    }

    const res = await this.embeddingService.embedDocument(documentId)

    await this.jobRepo.updateStatus(jobId, "completed")

    return {
      jobId,
      documentId,
      jobType: "embedding",
      success: true,
      pageCount: res.embeddedCount,
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

  /**
   * Recovers any stale processing jobs stranded by an abnormal shutdown or crash.
   */
  async recoverStaleJobs(): Promise<StaleJobRecoveryResult> {
    return await this.jobRepo.recoverStaleJobs(this.leaseDurationMs)
  }

  /**
   * Starts periodic background polling for pending jobs.
   * Performs crash recovery for stale jobs before initiating polling.
   */
  startBackground(intervalMs = 30000): void {
    if (this.backgroundTimer) return

    // Run startup crash recovery for stale jobs, then immediately process pending jobs
    void this.recoverStaleJobs().then(() => {
      void this.processPendingJobs()
    })

    this.backgroundTimer = setInterval(() => {
      void this.processPendingJobs()
    }, intervalMs)
  }

  /**
   * Stops periodic background polling
   */
  stopBackground(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer)
      this.backgroundTimer = null
    }
  }

  /**
   * Checks whether background polling is active
   */
  isBackgroundRunning(): boolean {
    return this.backgroundTimer !== null
  }
}
