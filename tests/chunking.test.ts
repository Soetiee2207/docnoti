import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { ChunkingService } from "@/services/chunking/chunkingService"
import type { ChunkInputPage } from "@/services/chunking/types"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentIngestionService } from "@/services/ingestionService"
import { DocumentWorker } from "@/services/worker/documentWorker"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"
import { createMultiPageTextPdf } from "./fixtures/samplePdfs"

function createChunkingTestContext() {
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
  const chunkRepo = new DocumentChunkRepository(db)
  const chunkingService = new ChunkingService(chunkRepo, pageRepo)
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
    pdfProcessor,
    undefined,
    undefined,
    false,
    chunkingService
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    pageRepo,
    chunkRepo,
    chunkingService,
    storageService,
    pdfProcessor,
    ingestionService,
    worker,
  }
}

describe("Document Chunking Pipeline Test Suite", () => {
  describe("Pure Chunking Logic (chunkDocument)", () => {
    const service = new ChunkingService()

    it("handles an empty page gracefully without creating invalid chunks", () => {
      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: "" },
        { pageNumber: 2, textContent: "   \n\t   \n   " },
      ]

      const chunks = service.chunkDocument("doc-1", pages)
      expect(chunks).toEqual([])
    })

    it("chunks a single paragraph with accurate provenance and character range", () => {
      const pageText = "Cộng hòa Xã hội Chủ nghĩa Việt Nam. Độc lập - Tự do - Hạnh phúc."
      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: pageText },
      ]

      const chunks = service.chunkDocument("doc-single", pages)
      expect(chunks.length).toBe(1)
      expect(chunks[0].documentId).toBe("doc-single")
      expect(chunks[0].pageNumber).toBe(1)
      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[0].content).toBe(pageText)
      expect(chunks[0].charStart).toBe(0)
      expect(chunks[0].charEnd).toBe(pageText.length)

      // Invariant: pageText slice matches chunk content exactly
      expect(pageText.slice(chunks[0].charStart, chunks[0].charEnd)).toBe(chunks[0].content)
    })

    it("chunks multiple paragraphs with distinct boundaries and exact character offsets", () => {
      const p1 = "Điều 1. Phạm vi điều chỉnh và đối tượng áp dụng của quy chế này."
      const p2 = "Điều 2. Nguyên tắc quản lý và bảo mật thông tin nội bộ của cơ quan."
      const p3 = "Điều 3. Trách nhiệm của các phòng ban liên quan trong việc thực hiện."
      const pageText = `  ${p1}  \n\n   ${p2}   \n\n\n  ${p3}  `

      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: pageText },
      ]

      const chunks = service.chunkDocument("doc-multi-para", pages)
      expect(chunks.length).toBe(3)

      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[0].content).toBe(p1)
      expect(pageText.slice(chunks[0].charStart, chunks[0].charEnd)).toBe(p1)

      expect(chunks[1].chunkIndex).toBe(1)
      expect(chunks[1].content).toBe(p2)
      expect(pageText.slice(chunks[1].charStart, chunks[1].charEnd)).toBe(p2)

      expect(chunks[2].chunkIndex).toBe(2)
      expect(chunks[2].content).toBe(p3)
      expect(pageText.slice(chunks[2].charStart, chunks[2].charEnd)).toBe(p3)
    })

    it("chunks multiple pages while strictly preserving page provenance and never spanning pages", () => {
      const pages: ChunkInputPage[] = [
        {
          pageNumber: 1,
          textContent: "Trang 1 - Đoạn 1.\n\nTrang 1 - Đoạn 2.",
        },
        {
          pageNumber: 2,
          textContent: "Trang 2 - Đoạn duy nhất.",
        },
        {
          pageNumber: 3,
          textContent: "Trang 3 - Đoạn A.\n\nTrang 3 - Đoạn B.",
        },
      ]

      const chunks = service.chunkDocument("doc-multi-page", pages)
      expect(chunks.length).toBe(5)

      // Deterministic sequential ordering
      expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3, 4])

      // Page 1 chunks
      expect(chunks[0].pageNumber).toBe(1)
      expect(chunks[0].content).toBe("Trang 1 - Đoạn 1.")
      expect(chunks[1].pageNumber).toBe(1)
      expect(chunks[1].content).toBe("Trang 1 - Đoạn 2.")

      // Page 2 chunk
      expect(chunks[2].pageNumber).toBe(2)
      expect(chunks[2].content).toBe("Trang 2 - Đoạn duy nhất.")

      // Page 3 chunks
      expect(chunks[3].pageNumber).toBe(3)
      expect(chunks[3].content).toBe("Trang 3 - Đoạn A.")
      expect(chunks[4].pageNumber).toBe(3)
      expect(chunks[4].content).toBe("Trang 3 - Đoạn B.")

      // Invariant: no chunk has multiple page numbers or spans boundaries
      for (const chunk of chunks) {
        expect(typeof chunk.pageNumber).toBe("number")
        expect([1, 2, 3]).toContain(chunk.pageNumber)
      }
    })

    it("deterministically sub-chunks an exceptionally long paragraph without losing source text", () => {
      const sentence1 = "Đây là câu thứ nhất của một đoạn văn bản rất dài cần được phân tách tự động."
      const sentence2 = "Câu thứ hai tiếp tục bổ sung thêm nhiều chi tiết quan trọng về quy trình xử lý tài liệu."
      const sentence3 = "Câu thứ ba nêu rõ các điều khoản bắt buộc phải tuân thủ trong suốt thời gian hiệu lực."
      const sentence4 = "Câu thứ tư kết luận nội dung và nhấn mạnh tính toàn vẹn của hồ sơ lưu trữ."

      const longParagraph = `${sentence1} ${sentence2} ${sentence3} ${sentence4}`

      // Configure a small maxChunkChars to force sub-chunking
      const smallService = new ChunkingService(undefined, undefined, {
        maxChunkChars: 110,
      })

      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: longParagraph },
      ]

      const chunks = smallService.chunkDocument("doc-long", pages, { maxChunkChars: 110 })
      expect(chunks.length).toBeGreaterThan(1)

      // Every sub-chunk must respect maxChunkChars
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(110)
        expect(longParagraph.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content)
      }

      // No source-text loss: all sentences must be present in the generated chunks
      const combinedText = chunks.map((c) => c.content).join(" ")
      expect(combinedText).toContain(sentence1)
      expect(combinedText).toContain(sentence2)
      expect(combinedText).toContain(sentence3)
      expect(combinedText).toContain(sentence4)
    })

    it("deterministically splits an exceptionally long unbroken string without space", () => {
      // 350 characters of unbroken text
      const unbrokenText = "A".repeat(100) + "B".repeat(100) + "C".repeat(100) + "D".repeat(50)
      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: unbrokenText },
      ]

      const smallService = new ChunkingService(undefined, undefined, { maxChunkChars: 100 })
      const chunks = smallService.chunkDocument("doc-unbroken", pages, { maxChunkChars: 100 })

      expect(chunks.length).toBe(4)
      expect(chunks[0].content).toBe("A".repeat(100))
      expect(chunks[1].content).toBe("B".repeat(100))
      expect(chunks[2].content).toBe("C".repeat(100))
      expect(chunks[3].content).toBe("D".repeat(50))

      // Character range verification
      expect(unbrokenText.slice(chunks[0].charStart, chunks[0].charEnd)).toBe(chunks[0].content)
      expect(unbrokenText.slice(chunks[3].charStart, chunks[3].charEnd)).toBe(chunks[3].content)
    })

    it("produces deterministic output across repeated invocations", () => {
      const text = "Đoạn văn thứ nhất.\n\nĐoạn văn thứ hai rất dài với nhiều câu văn. Câu văn tiếp theo của đoạn hai.\n\nĐoạn văn thứ ba kết thúc."
      const pages: ChunkInputPage[] = [
        { pageNumber: 1, textContent: text },
      ]

      const run1 = service.chunkDocument("doc-det", pages, { maxChunkChars: 60 })
      const run2 = service.chunkDocument("doc-det", pages, { maxChunkChars: 60 })

      expect(run1).toEqual(run2)
    })
  })

  describe("Persistence & Repository (DocumentChunkRepository)", () => {
    it("runs migration 0003_document_chunks successfully and creates table", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      const count = await ctx.chunkRepo.countByDocumentId("non-existent")
      expect(count).toBe(0)
    })

    it("persists generated chunks and queries them by documentId and pageNumber", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      // Create a parent document record
      const doc = await ctx.documentRepo.create({
        id: "doc-repo-test",
        name: "test.pdf",
        originalPath: "C:/test.pdf",
        storagePath: "storage/test.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        checksum: "abc123hash",
        status: "imported",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      // Add pages to pageRepo
      await ctx.pageRepo.savePages(doc.id, [
        {
          id: `${doc.id}_p1`,
          documentId: doc.id,
          pageNumber: 1,
          textContent: "Trang 1 - Mục tiêu dự án.\n\nTrang 1 - Kế hoạch triển khai.",
          charCount: 50,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `${doc.id}_p2`,
          documentId: doc.id,
          pageNumber: 2,
          textContent: "Trang 2 - Dự toán ngân sách.",
          charCount: 25,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // Chunk and save
      const savedChunks = await ctx.chunkingService.chunkAndSave(doc.id)
      expect(savedChunks.length).toBe(3)

      // Query by documentId
      const fetchedAll = await ctx.chunkRepo.findByDocumentId(doc.id)
      expect(fetchedAll.length).toBe(3)
      expect(fetchedAll[0].chunkIndex).toBe(0)
      expect(fetchedAll[1].chunkIndex).toBe(1)
      expect(fetchedAll[2].chunkIndex).toBe(2)

      // Query by pageNumber
      const page1Chunks = await ctx.chunkRepo.findByPage(doc.id, 1)
      expect(page1Chunks.length).toBe(2)
      expect(page1Chunks[0].content).toContain("Mục tiêu")
      expect(page1Chunks[1].content).toContain("Kế hoạch")

      const page2Chunks = await ctx.chunkRepo.findByPage(doc.id, 2)
      expect(page2Chunks.length).toBe(1)
      expect(page2Chunks[0].content).toContain("ngân sách")

      // Verify individual findById
      const singleChunk = await ctx.chunkRepo.findById(savedChunks[0].id)
      expect(singleChunk).not.toBeNull()
      expect(singleChunk?.content).toBe(savedChunks[0].content)
    })

    it("is idempotent: re-chunking a document replaces chunks without duplicates", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      const doc = await ctx.documentRepo.create({
        id: "doc-idempotent",
        name: "idempotent.pdf",
        originalPath: "C:/idempotent.pdf",
        storagePath: "storage/idempotent.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        checksum: "hash-idem",
        status: "imported",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await ctx.pageRepo.savePages(doc.id, [
        {
          id: `${doc.id}_p1`,
          documentId: doc.id,
          pageNumber: 1,
          textContent: "Nội dung ban đầu đoạn 1.\n\nNội dung ban đầu đoạn 2.",
          charCount: 45,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // First chunking run
      await ctx.chunkingService.chunkAndSave(doc.id)
      const count1 = await ctx.chunkRepo.countByDocumentId(doc.id)
      expect(count1).toBe(2)

      // Re-run chunking on the same document
      await ctx.chunkingService.chunkAndSave(doc.id)
      const count2 = await ctx.chunkRepo.countByDocumentId(doc.id)
      expect(count2).toBe(2) // Still exactly 2 chunks, no duplicate rows!

      // Re-run with updated page content
      await ctx.pageRepo.savePages(doc.id, [
        {
          id: `${doc.id}_p1`,
          documentId: doc.id,
          pageNumber: 1,
          textContent: "Chỉ có một đoạn mới duy nhất.",
          charCount: 30,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      await ctx.chunkingService.chunkAndSave(doc.id)
      const count3 = await ctx.chunkRepo.countByDocumentId(doc.id)
      expect(count3).toBe(1) // Replaced cleanly with 1 chunk!
      const finalChunks = await ctx.chunkRepo.findByDocumentId(doc.id)
      expect(finalChunks[0].content).toBe("Chỉ có một đoạn mới duy nhất.")
    })

    it("never modifies or replaces document_pages as part of chunk persistence", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      const doc = await ctx.documentRepo.create({
        id: "doc-pages-unmodified",
        name: "pages.pdf",
        originalPath: "C:/pages.pdf",
        storagePath: "storage/pages.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        checksum: "hash-unmodified",
        status: "imported",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const originalPageRecord = {
        id: `${doc.id}_p1`,
        documentId: doc.id,
        pageNumber: 1,
        textContent: "Trang mẫu không được phép bị thay đổi.",
        charCount: 38,
        hasSufficientText: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }

      await ctx.pageRepo.savePages(doc.id, [originalPageRecord])

      // Perform chunking
      await ctx.chunkingService.chunkAndSave(doc.id)

      // Verify document_pages was untouched
      const pagesAfter = await ctx.pageRepo.findByDocumentId(doc.id)
      expect(pagesAfter.length).toBe(1)
      expect(pagesAfter[0].textContent).toBe(originalPageRecord.textContent)
      expect(pagesAfter[0].createdAt).toBe(originalPageRecord.createdAt)
      expect(pagesAfter[0].updatedAt).toBe(originalPageRecord.updatedAt)
    })

    it("rolls back chunk transaction if an insertion fails, avoiding partial chunk sets", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      const doc = await ctx.documentRepo.create({
        id: "doc-rollback-test",
        name: "rollback.pdf",
        originalPath: "C:/rollback.pdf",
        storagePath: "storage/rollback.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        checksum: "hash-rollback",
        status: "imported",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      // Seed initial valid chunks
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: `${doc.id}_c0`,
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Initial valid chunk",
          charStart: 0,
          charEnd: 19,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      const initialCount = await ctx.chunkRepo.countByDocumentId(doc.id)
      expect(initialCount).toBe(1)

      // Attempt to save invalid chunks that violate unique constraint on chunk_index
      const invalidChunks = [
        {
          id: `${doc.id}_c0`,
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "First chunk",
          charStart: 0,
          charEnd: 11,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `${doc.id}_c0_duplicate`,
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0, // Violates UNIQUE INDEX idx_document_chunks_doc_chunk_idx!
          content: "Duplicate index chunk",
          charStart: 12,
          charEnd: 33,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      await expect(ctx.chunkRepo.saveChunks(doc.id, invalidChunks)).rejects.toThrow()

      // Transaction rollback must have occurred: the initial chunk was preserved or state rolled back!
      const countAfter = await ctx.chunkRepo.countByDocumentId(doc.id)
      expect(countAfter).toBe(1)
      const remaining = await ctx.chunkRepo.findByDocumentId(doc.id)
      expect(remaining[0].content).toBe("Initial valid chunk")
    })
  })

  describe("Worker Pipeline Integration", () => {
    it("automatically chunks document pages when PDF text extraction completes", async () => {
      const ctx = createChunkingTestContext()
      await runMigrations(ctx.executor)

      // Ingest multi-page text PDF
      const { document, job } = await ctx.ingestionService.ingestDocument("C:/worker_chunk_test.pdf")
      const pdfBytes = createMultiPageTextPdf()
      ctx.storageService.setFileBuffer(document.storagePath, pdfBytes)

      // Execute worker processing
      const result = await ctx.worker.processJob(job.id)
      expect(result.success).toBe(true)
      expect(result.needsOcr).toBe(false)

      // Document status updated to 'processed'
      const updatedDoc = await ctx.documentRepo.findById(document.id)
      expect(updatedDoc?.status).toBe("processed")

      // Pages must exist
      const pages = await ctx.pageRepo.findByDocumentId(document.id)
      expect(pages.length).toBe(3)

      // Chunks must have been automatically generated and persisted!
      const chunks = await ctx.chunkRepo.findByDocumentId(document.id)
      expect(chunks.length).toBeGreaterThanOrEqual(3)

      // Verify chunk provenance matches pages
      expect(chunks[0].pageNumber).toBe(1)
      expect(chunks[0].chunkIndex).toBe(0)
      expect(chunks[0].content).toContain("Trang mot")

      expect(chunks[1].pageNumber).toBe(2)
      expect(chunks[1].chunkIndex).toBe(1)
      expect(chunks[1].content).toContain("Trang hai")

      expect(chunks[2].pageNumber).toBe(3)
      expect(chunks[2].chunkIndex).toBe(2)
      expect(chunks[2].content).toContain("Trang ba")
    })
  })
})
