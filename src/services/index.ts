import { initDb, type AppDatabase } from "@/db/client"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import {
  TauriStorageService,
  InMemoryStorageService,
  type StorageService,
} from "./storage"
import { DocumentIngestionService } from "./ingestionService"
import { type PDFProcessor } from "./pdf/types"
import { PdfJsProcessor } from "./pdf/pdfJsProcessor"
import { DocumentWorker } from "./worker/documentWorker"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

export interface AppServices {
  db: AppDatabase
  documentRepo: DocumentRepository
  jobRepo: ProcessingJobRepository
  pageRepo: DocumentPageRepository
  storageService: StorageService
  pdfProcessor: PDFProcessor
  ingestionService: DocumentIngestionService
  documentWorker: DocumentWorker
}

let servicesInstance: AppServices | null = null
let servicesPromise: Promise<AppServices> | null = null

export async function getAppServices(): Promise<AppServices> {
  if (servicesInstance) {
    return servicesInstance
  }

  if (servicesPromise) {
    return servicesPromise
  }

  servicesPromise = (async () => {
    try {
      const db = await initDb()
      const documentRepo = new DocumentRepository(db)
      const jobRepo = new ProcessingJobRepository(db)
      const pageRepo = new DocumentPageRepository(db)
      const storageService: StorageService = isTauriEnvironment()
        ? new TauriStorageService()
        : new InMemoryStorageService()
      const pdfProcessor: PDFProcessor = new PdfJsProcessor()

      const ingestionService = new DocumentIngestionService(
        documentRepo,
        jobRepo,
        storageService
      )

      const documentWorker = new DocumentWorker(
        documentRepo,
        jobRepo,
        pageRepo,
        storageService,
        pdfProcessor
      )

      servicesInstance = {
        db,
        documentRepo,
        jobRepo,
        pageRepo,
        storageService,
        pdfProcessor,
        ingestionService,
        documentWorker,
      }

      return servicesInstance
    } finally {
      servicesPromise = null
    }
  })()

  return servicesPromise
}
