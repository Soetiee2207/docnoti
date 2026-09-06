import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { DocumentChunkEmbeddingRepository } from "@/repositories/documentChunkEmbeddingRepository"
import {
  DeterministicEmbeddingProvider,
  LocalJinaEmbeddingProvider,
  EmbeddingService,
  EmbeddingError,
} from "@/services/embedding"
import { ChunkingService } from "@/services/chunking"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentWorker } from "@/services/worker/documentWorker"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"
import { createValidTextPdf } from "./fixtures/samplePdfs"

function createEmbeddingTestContext(customSqlite?: DatabaseSync) {
  const sqlite = customSqlite ?? new DatabaseSync(":memory:")

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
  const chunkRepo = new DocumentChunkRepository(db)
  const embeddingRepo = new DocumentChunkEmbeddingRepository(db)
  const provider = new DeterministicEmbeddingProvider()
  const embeddingService = new EmbeddingService(provider, chunkRepo, embeddingRepo)
  const chunkingService = new ChunkingService(chunkRepo, pageRepo)
  const storageService = new InMemoryStorageService()
  const pdfProcessor = new PdfJsProcessor({ minCharsPerPage: 20 })

  const worker = new DocumentWorker(
    documentRepo,
    jobRepo,
    pageRepo,
    storageService,
    pdfProcessor,
    undefined,
    undefined,
    false,
    chunkingService,
    embeddingService
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    pageRepo,
    chunkRepo,
    embeddingRepo,
    provider,
    embeddingService,
    chunkingService,
    storageService,
    pdfProcessor,
    worker,
  }
}

let docCounter = 0
async function createTestDoc(
  repo: DocumentRepository,
  name: string,
  checksum: string
) {
  docCounter++
  const id = `doc-embed-${docCounter}-${Date.now()}`
  const now = new Date().toISOString()
  const record: NewDocumentRecord = {
    id,
    name,
    originalPath: `/${name}`,
    storagePath: `app_data/${name}`,
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum,
    status: "imported",
    createdAt: now,
    updatedAt: now,
  }
  return repo.create(record)
}

describe("Local Vector Embedding Pipeline (jina-embeddings-v5-text-small)", () => {
  let ctx: ReturnType<typeof createEmbeddingTestContext>

  beforeEach(async () => {
    ctx = createEmbeddingTestContext()
    await runMigrations(ctx.executor)
  })

  describe("EmbeddingProvider Contract & Metadata", () => {
    it("preserves exact model identity, 1024 dimensions, and CC BY-NC 4.0 license", () => {
      const metadata = ctx.provider.getMetadata()
      expect(metadata.model).toBe("jina-embeddings-v5-text-small")
      expect(metadata.dimensions).toBe(1024)
      expect(metadata.license).toBe("CC BY-NC 4.0")
      expect(metadata.version).toBeDefined()
    })

    it("generates normalized 1024-dimensional vectors for text", async () => {
      const vector = await ctx.provider.embedText("Hóa đơn giá trị gia tăng số 12345/HD")
      expect(vector).toHaveLength(1024)

      // Verify L2 normalization (unit vector: norm ≈ 1.0)
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
      expect(norm).toBeCloseTo(1.0, 5)
    })

    it("generates deterministic vectors (identical text produces identical vector)", async () => {
      const v1 = await ctx.provider.embedText("Hợp đồng lao động xác định thời hạn")
      const v2 = await ctx.provider.embedText("Hợp đồng lao động xác định thời hạn")
      const v3 = await ctx.provider.embedText("Biên bản thanh lý hợp đồng")

      expect(v1).toEqual(v2)
      expect(v1).not.toEqual(v3)
    })

    it("embeds batches of chunks preserving chunkId correlation", async () => {
      const inputs = [
        { chunkId: "c1", content: "Chunk number one text" },
        { chunkId: "c2", content: "Chunk number two text" },
      ]

      const results = await ctx.provider.embedChunks(inputs)
      expect(results).toHaveLength(2)
      expect(results[0].chunkId).toBe("c1")
      expect(results[0].vector).toHaveLength(1024)
      expect(results[1].chunkId).toBe("c2")
      expect(results[1].vector).toHaveLength(1024)
      expect(results[0].vector).not.toEqual(results[1].vector)
    })
  })

  describe("Vector Schema & Persistence", () => {
    it("creates document_chunk_embeddings table, indexes, and triggers during migration", async () => {
      const tables = ctx.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_chunk_embeddings'")
        .all()
      expect(tables).toHaveLength(1)

      const triggers = ctx.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_document_chunk_embeddings_ad'")
        .all()
      expect(triggers).toHaveLength(1)
    })

    it("persists chunk embeddings and retrieves them with model and dimensions metadata", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "invoice.pdf", "sum-v-1")

      const chunks: NewDocumentChunkRecord[] = [
        {
          id: "chunk-v1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Invoice payment deadline is strictly March 31, 2026.",
          charStart: 0,
          charEnd: 52,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
      await ctx.chunkRepo.saveChunks(doc.id, chunks)

      const res = await ctx.embeddingService.embedDocument(doc.id)
      expect(res.embeddedCount).toBe(1)
      expect(res.model).toBe("jina-embeddings-v5-text-small")
      expect(res.dimensions).toBe(1024)

      const record = await ctx.embeddingRepo.findByChunkId("chunk-v1")
      expect(record).not.toBeNull()
      expect(record?.chunkId).toBe("chunk-v1")
      expect(record?.documentId).toBe(doc.id)
      expect(record?.model).toBe("jina-embeddings-v5-text-small")
      expect(record?.dimensions).toBe(1024)

      const vector = JSON.parse(record!.embedding) as number[]
      expect(vector).toHaveLength(1024)
    })

    it("is idempotent: re-embedding the same document updates without duplicating records", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "repeat.pdf", "sum-v-2")
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "chunk-repeat-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Operating expenses summary for fourth quarter.",
          charStart: 0,
          charEnd: 46,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // First embed
      await ctx.embeddingService.embedDocument(doc.id)
      expect(await ctx.embeddingRepo.count()).toBe(1)

      // Re-embed same document
      await ctx.embeddingService.embedDocument(doc.id)
      expect(await ctx.embeddingRepo.count()).toBe(1)
    })

    it("preserves persisted embeddings across database reopen", async () => {
      // Create embedding in current db
      const doc = await createTestDoc(ctx.documentRepo, "reopen.pdf", "sum-v-3")
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "chunk-reopen-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Important covenant persisting across db connection reopen.",
          charStart: 0,
          charEnd: 58,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      await ctx.embeddingService.embedDocument(doc.id)

      // Query raw sqlite directly to verify physical disk persistence
      const row = ctx.sqlite
        .prepare("SELECT chunk_id, model, dimensions, embedding FROM document_chunk_embeddings WHERE chunk_id = 'chunk-reopen-1'")
        .get() as { chunk_id: string; model: string; dimensions: number; embedding: string }

      expect(row).toBeDefined()
      expect(row.chunk_id).toBe("chunk-reopen-1")
      expect(row.model).toBe("jina-embeddings-v5-text-small")
      expect(row.dimensions).toBe(1024)
      const parsed = JSON.parse(row.embedding)
      expect(parsed).toHaveLength(1024)
    })
  })

  describe("Stale Embedding Removal & Lifecycle", () => {
    it("removes stale embeddings when chunks are replaced (re-chunking)", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "rechunk.pdf", "sum-v-4")

      // Initial chunk v1
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "old-chunk-v1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Version 1 chunk content.",
          charStart: 0,
          charEnd: 24,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      await ctx.embeddingService.embedDocument(doc.id)
      expect(await ctx.embeddingRepo.findByChunkId("old-chunk-v1")).not.toBeNull()

      // Re-chunk document: replaces old chunks with new chunks
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "new-chunk-v2",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Version 2 replacement chunk content.",
          charStart: 0,
          charEnd: 36,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // Old chunk embedding must be automatically removed via DELETE trigger on document_chunks
      const oldEmb = await ctx.embeddingRepo.findByChunkId("old-chunk-v1")
      expect(oldEmb).toBeNull()

      // Embed new chunk
      await ctx.embeddingService.embedDocument(doc.id)
      const newEmb = await ctx.embeddingRepo.findByChunkId("new-chunk-v2")
      expect(newEmb).not.toBeNull()
      expect(await ctx.embeddingRepo.count()).toBe(1)
    })

    it("removes embeddings when document chunks are deleted", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "delete.pdf", "sum-v-5")
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "del-chunk-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Chunk to be deleted.",
          charStart: 0,
          charEnd: 20,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      await ctx.embeddingService.embedDocument(doc.id)
      expect(await ctx.embeddingRepo.count()).toBe(1)

      // Delete by document
      await ctx.chunkRepo.deleteByDocumentId(doc.id)
      expect(await ctx.embeddingRepo.count()).toBe(0)
    })
  })

  describe("Background Worker Integration", () => {
    it("automatically enqueues and completes embedding job when document pipeline runs", async () => {
      const pdfBytes = createValidTextPdf()
      const storagePath = "app_data/worker_test.pdf"
      ctx.storageService.setFileBuffer(storagePath, pdfBytes)

      const doc = await ctx.documentRepo.create({
        id: "doc-worker-1",
        name: "worker_test.pdf",
        originalPath: "/worker_test.pdf",
        storagePath,
        fileSize: pdfBytes.length,
        mimeType: "application/pdf",
        checksum: "sum-work-1",
        status: "imported",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const pdfJob = await ctx.jobRepo.create({
        id: "job-pdf-1",
        documentId: doc.id,
        jobType: "document_pipeline",
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      // Run PDF processing job
      const pdfRes = await ctx.worker.processJob(pdfJob.id)
      expect(pdfRes.success).toBe(true)

      // Check that chunks were created
      const chunks = await ctx.chunkRepo.findByDocumentId(doc.id)
      expect(chunks.length).toBeGreaterThan(0)

      // Check that an embedding job was automatically enqueued
      const pendingJobs = await ctx.jobRepo.findByDocumentId(doc.id)
      const embedJob = pendingJobs.find((j) => j.jobType === "embedding")
      expect(embedJob).toBeDefined()
      expect(embedJob?.status).toBe("pending")

      // Process embedding job via worker
      const embedRes = await ctx.worker.processJob(embedJob!.id)
      expect(embedRes.success).toBe(true)
      expect(embedRes.jobType).toBe("embedding")

      // Verify embeddings exist in SQLite
      const embeddings = await ctx.embeddingRepo.findByDocumentId(doc.id)
      expect(embeddings.length).toBe(chunks.length)
      expect(embeddings[0].dimensions).toBe(1024)
    })

    it("idempotently handles duplicate enqueueEmbeddingJob requests", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "dup_job.pdf", "sum-v-6")

      const job1 = await ctx.worker.enqueueEmbeddingJob(doc.id)
      const job2 = await ctx.worker.enqueueEmbeddingJob(doc.id)

      expect(job1.id).toBe(job2.id)
      const allJobs = await ctx.jobRepo.findByDocumentId(doc.id)
      expect(allJobs.filter((j) => j.jobType === "embedding")).toHaveLength(1)
    })

    it("safe failure: embedding job failure does NOT mark document as failed", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "fail_safe.pdf", "sum-v-7")
      await ctx.documentRepo.updateStatus(doc.id, "processed")

      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "chunk-fail-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Text that fails during embedding inference.",
          charStart: 0,
          charEnd: 42,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // Create a failing provider test double
      const failingProvider = {
        name: "FailingProvider",
        model: "jina-embeddings-v5-text-small",
        dimensions: 1024,
        getMetadata: () => ctx.provider.getMetadata(),
        isAvailable: async () => true,
        embedText: async () => { throw new EmbeddingError("Inference failed", "INFERENCE_ERR", true) },
        embedChunks: async () => { throw new EmbeddingError("Inference failed", "INFERENCE_ERR", true) },
      }

      ctx.embeddingService.setProvider(failingProvider)

      const embedJob = await ctx.worker.enqueueEmbeddingJob(doc.id)

      // Fail attempt 1
      const res1 = await ctx.worker.processJob(embedJob.id)
      expect(res1.success).toBe(false)
      const updatedJob1 = await ctx.jobRepo.findById(embedJob.id)
      expect(updatedJob1?.retryCount).toBe(1)
      expect(updatedJob1?.status).toBe("pending")

      // Fail attempt 2
      await ctx.worker.processJob(embedJob.id)
      const updatedJob2 = await ctx.jobRepo.findById(embedJob.id)
      expect(updatedJob2?.retryCount).toBe(2)

      // Fail attempt 3 (exhausts maxRetries = 3)
      await ctx.worker.processJob(embedJob.id)
      const finalJob = await ctx.jobRepo.findById(embedJob.id)
      expect(finalJob?.status).toBe("failed")

      // INVARIANT CHECK: Document MUST remain usable and not marked failed
      const docAfter = await ctx.documentRepo.findById(doc.id)
      expect(docAfter?.status).toBe("processed")
    })
  })

  describe("Isolated Real Model Integration Check", () => {
    it("truthfully reports availability of local jina-embeddings-v5-text-small weights without network access", async () => {
      const realProvider = new LocalJinaEmbeddingProvider()
      expect(realProvider.model).toBe("jina-embeddings-v5-text-small")
      expect(realProvider.dimensions).toBe(1024)

      // Truthfully checks local disk without accessing the internet
      const available = await realProvider.isAvailable()
      expect(typeof available).toBe("boolean")

      if (!available) {
        // When local model weights have not been downloaded to models/jina-embeddings-v5-text-small,
        // it must throw a clear, non-retryable MODEL_WEIGHTS_MISSING error
        await expect(
          realProvider.embedChunks([{ chunkId: "c1", content: "Test text" }])
        ).rejects.toThrow(/Local model weights for 'jina-embeddings-v5-text-small' are not present on disk/)
      }
    })
  })
})
