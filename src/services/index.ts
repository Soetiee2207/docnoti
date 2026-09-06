import { initDb, type AppDatabase } from "@/db/client"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { AnalysisRepository } from "@/repositories/analysisRepository"
import {
  TauriStorageService,
  InMemoryStorageService,
  type StorageService,
} from "./storage"
import { DocumentIngestionService } from "./ingestionService"
import { type PDFProcessor } from "./pdf/types"
import { PdfJsProcessor } from "./pdf/pdfJsProcessor"
import { DocumentWorker } from "./worker/documentWorker"
import {
  CanvasPageRenderer,
  PaddleOCRProvider,
  OCRService,
  type OCRProvider,
  type PageRenderer,
} from "./ocr"
import {
  type AIProvider,
  MockAIProvider,
  OpenAIProvider,
  AnalysisService,
  AIConfigService,
  AIProviderSelector,
} from "./ai"
import {
  type SecretsService,
  InMemorySecretsService,
} from "./secrets"
import {
  ChunkingService,
} from "./chunking"
import { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import { FtsSearchService } from "./search"
import { DocumentChunkEmbeddingRepository } from "@/repositories/documentChunkEmbeddingRepository"
import {
  type EmbeddingProvider,
  DeterministicEmbeddingProvider,
  EmbeddingService,
} from "./embedding"
import { HybridRetrievalService } from "./retrieval"

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
  chunkRepo: DocumentChunkRepository
  analysisRepo: AnalysisRepository
  ftsSearchRepo: FtsSearchRepository
  ftsSearchService: FtsSearchService
  embeddingRepo: DocumentChunkEmbeddingRepository
  embeddingProvider: EmbeddingProvider
  embeddingService: EmbeddingService
  hybridRetrievalService: HybridRetrievalService
  secretsService: SecretsService
  storageService: StorageService
  pdfProcessor: PDFProcessor
  ocrProvider: OCRProvider
  pageRenderer: PageRenderer
  ocrService: OCRService
  chunkingService: ChunkingService
  ingestionService: DocumentIngestionService
  documentWorker: DocumentWorker
  aiProvider: AIProvider
  mockAiProvider: MockAIProvider
  openAiProvider: OpenAIProvider
  aiConfigService: AIConfigService
  aiProviderSelector: AIProviderSelector
  analysisService: AnalysisService
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
      const chunkRepo = new DocumentChunkRepository(db)
      const analysisRepo = new AnalysisRepository(db)
      const ftsSearchRepo = new FtsSearchRepository(db)
      const ftsSearchService = new FtsSearchService(ftsSearchRepo)
      const embeddingRepo = new DocumentChunkEmbeddingRepository(db)
      const embeddingProvider: EmbeddingProvider = new DeterministicEmbeddingProvider()
      const embeddingService = new EmbeddingService(
        embeddingProvider,
        chunkRepo,
        embeddingRepo
      )
      const chunkingService = new ChunkingService(chunkRepo, pageRepo)
      const hybridRetrievalService = new HybridRetrievalService(
        ftsSearchService,
        embeddingRepo,
        embeddingProvider
      )
      const storageService: StorageService = isTauriEnvironment()
        ? new TauriStorageService()
        : new InMemoryStorageService()
      const pdfProcessor: PDFProcessor = new PdfJsProcessor()

      const pageRenderer = new CanvasPageRenderer(2.0)
      const ocrProvider = new PaddleOCRProvider()
      const ocrService = new OCRService(ocrProvider, pageRenderer)

      const secretsService: SecretsService = new InMemorySecretsService()
      const mockAiProvider = new MockAIProvider()
      const openAiProvider = new OpenAIProvider(secretsService)
      const aiConfigService = new AIConfigService({
        providerType: 'mock',
        cloudEnabled: false,
      })
      const aiProviderSelector = new AIProviderSelector(
        mockAiProvider,
        openAiProvider,
        aiConfigService
      )

      // Dynamically resolves provider according to strict opt-in policy
      const aiProvider: AIProvider = mockAiProvider

      const analysisService = new AnalysisService({
        aiProvider: () => aiProviderSelector.getActiveProvider(),
        analysisRepo,
        documentRepo,
        pageRepo,
      })

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
        pdfProcessor,
        ocrService,
        analysisService,
        false,
        chunkingService,
        embeddingService
      )

      servicesInstance = {
        db,
        documentRepo,
        jobRepo,
        pageRepo,
        chunkRepo,
        analysisRepo,
        ftsSearchRepo,
        ftsSearchService,
        embeddingRepo,
        embeddingProvider,
        embeddingService,
        hybridRetrievalService,
        secretsService,
        storageService,
        pdfProcessor,
        ocrProvider,
        pageRenderer,
        ocrService,
        chunkingService,
        ingestionService,
        documentWorker,
        aiProvider,
        mockAiProvider,
        openAiProvider,
        aiConfigService,
        aiProviderSelector,
        analysisService,
      }

      return servicesInstance
    } finally {
      servicesPromise = null
    }
  })()

  return servicesPromise
}

export function resetAppServices(): void {
  servicesInstance = null
  servicesPromise = null
}

export * from "./ai"
export * from "./secrets"
export * from "./chunking"
export * from "./search"
export * from "./embedding"
export * from "./retrieval"





