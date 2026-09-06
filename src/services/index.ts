import { initDb, type AppDatabase } from "@/db/client"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import {
  TauriStorageService,
  InMemoryStorageService,
  type StorageService,
} from "./storage"
import { DocumentIngestionService } from "./ingestionService"

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
  storageService: StorageService
  ingestionService: DocumentIngestionService
}

let servicesInstance: AppServices | null = null

export async function getAppServices(): Promise<AppServices> {
  if (servicesInstance) {
    return servicesInstance
  }

  const db = await initDb()
  const documentRepo = new DocumentRepository(db)
  const jobRepo = new ProcessingJobRepository(db)
  const storageService: StorageService = isTauriEnvironment()
    ? new TauriStorageService()
    : new InMemoryStorageService()

  const ingestionService = new DocumentIngestionService(
    documentRepo,
    jobRepo,
    storageService
  )

  servicesInstance = {
    db,
    documentRepo,
    jobRepo,
    storageService,
    ingestionService,
  }

  return servicesInstance
}
