import type { DocumentRepository } from "@/repositories/documentRepository"
import type { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import type { StorageService, StoredFileInfo } from "./storage"
import type { DocumentRecord, ProcessingJobRecord } from "@/db/schema"

export class IngestionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IngestionValidationError"
  }
}

export class DuplicateDocumentError extends Error {
  readonly existingDocument: DocumentRecord

  constructor(
    existingDocument: DocumentRecord,
    message = "Tài liệu này đã tồn tại trong hệ thống."
  ) {
    super(message)
    this.name = "DuplicateDocumentError"
    this.existingDocument = existingDocument
  }
}

export interface IngestionResult {
  document: DocumentRecord
  job: ProcessingJobRecord
}

export class DocumentIngestionService {
  private documentRepo: DocumentRepository
  private jobRepo: ProcessingJobRepository
  private storageService: StorageService

  constructor(
    documentRepo: DocumentRepository,
    jobRepo: ProcessingJobRepository,
    storageService: StorageService
  ) {
    this.documentRepo = documentRepo
    this.jobRepo = jobRepo
    this.storageService = storageService
  }

  /**
   * Validate file path before ingestion
   */
  validateFilePath(sourcePath: string): void {
    if (!sourcePath || typeof sourcePath !== "string" || sourcePath.trim().length === 0) {
      throw new IngestionValidationError("Đường dẫn tệp không hợp lệ.")
    }

    const cleanPath = sourcePath.trim()
    const isPdf = cleanPath.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      throw new IngestionValidationError("Chỉ hỗ trợ định dạng PDF trong phiên bản V1.")
    }
  }

  /**
   * Ingest a single PDF document:
   * 1. Validate extension and path
   * 2. Copy to managed local storage
   * 3. Verify duplicate checksum
   * 4. Insert Document record in SQLite
   * 5. Insert ProcessingJob record in SQLite
   * 6. Cleanup storage on DB error
   */
  async ingestDocument(sourcePath: string): Promise<IngestionResult> {
    this.validateFilePath(sourcePath)

    let storedInfo: StoredFileInfo | null = null

    try {
      // Step 1: Copy file to managed storage and compute checksum
      storedInfo = await this.storageService.importPdf(sourcePath)

      // Step 2: Check for existing document with same checksum to prevent accidental duplicates
      const existing = await this.documentRepo.findByChecksum(storedInfo.checksum)
      if (existing) {
        // Rollback the copied file
        await this.storageService.deleteStoredFile(storedInfo.storagePath)
        throw new DuplicateDocumentError(existing)
      }

      // Step 3: Insert Document record
      const now = new Date().toISOString()
      const document = await this.documentRepo.create({
        id: storedInfo.id,
        name: storedInfo.name,
        originalPath: storedInfo.originalPath,
        storagePath: storedInfo.storagePath,
        fileSize: storedInfo.fileSize,
        mimeType: "application/pdf",
        checksum: storedInfo.checksum,
        status: "imported",
        createdAt: now,
        updatedAt: now,
      })

      // Step 4: Create persistent ProcessingJob for background pipeline
      const jobId = `job-${document.id}-${Date.now()}`
      const job = await this.jobRepo.create({
        id: jobId,
        documentId: document.id,
        jobType: "document_pipeline",
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      })

      return { document, job }
    } catch (error) {
      // Rollback: if file was already stored but database insertion failed, delete stored copy
      if (storedInfo && !(error instanceof DuplicateDocumentError)) {
        try {
          await this.storageService.deleteStoredFile(storedInfo.storagePath)
        } catch (cleanupError) {
          console.error("Failed to clean up stored file after ingestion error:", cleanupError)
        }
      }
      throw error
    }
  }

  /**
   * Batch ingest multiple PDF documents
   */
  async ingestMultiple(sourcePaths: string[]): Promise<{
    succeeded: IngestionResult[]
    failed: { path: string; error: Error }[]
  }> {
    const succeeded: IngestionResult[] = []
    const failed: { path: string; error: Error }[] = []

    for (const path of sourcePaths) {
      try {
        const result = await this.ingestDocument(path)
        succeeded.push(result)
      } catch (err) {
        failed.push({
          path,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    }

    return { succeeded, failed }
  }

  /**
   * Deletes a document and all of its dependent database records and managed storage file.
   * Safe and idempotent: returns false if the document does not exist.
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    if (!documentId) return false

    const document = await this.documentRepo.findById(documentId)
    if (!document) {
      return false
    }

    const storagePath = document.storagePath

    // 1. Delete all database records across all dependent tables in cascade
    await this.documentRepo.delete(documentId)

    // 2. Delete managed physical storage file
    if (storagePath) {
      try {
        await this.storageService.deleteStoredFile(storagePath)
      } catch (err) {
        console.warn(`[DocumentIngestionService] Could not remove physical file ${storagePath}:`, err)
      }
    }

    return true
  }
}

