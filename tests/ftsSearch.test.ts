import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import { FtsSearchService } from "@/services/search/ftsSearchService"
import type { NewDocumentChunkRecord } from "@/db/schema"

function createFtsTestContext() {
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
  const chunkRepo = new DocumentChunkRepository(db)
  const ftsRepo = new FtsSearchRepository(db)
  const ftsService = new FtsSearchService(ftsRepo)

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    chunkRepo,
    ftsRepo,
    ftsService,
  }
}

let docCounter = 0
async function createTestDoc(
  repo: DocumentRepository,
  name: string,
  checksum: string
) {
  docCounter++
  const id = `doc-${docCounter}-${Date.now()}`
  const now = new Date().toISOString()
  return repo.create({
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
  })
}

describe("SQLite FTS5 Full-Text Search on Document Chunks", () => {
  let ctx: ReturnType<typeof createFtsTestContext>

  beforeEach(async () => {
    ctx = createFtsTestContext()
    await runMigrations(ctx.executor)
  })

  describe("Index Migration & Triggers", () => {
    it("creates document_chunks_fts virtual table and sync triggers during migration", async () => {
      const tables = ctx.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='document_chunks_fts'"
        )
        .all()
      expect(tables).toHaveLength(1)

      const triggers = ctx.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_document_chunks_fts_%'"
        )
        .all() as { name: string }[]

      const triggerNames = triggers.map((t) => t.name).sort()
      expect(triggerNames).toEqual([
        "trg_document_chunks_fts_ad",
        "trg_document_chunks_fts_ai",
        "trg_document_chunks_fts_au",
      ])
    })

    it("backfills pre-existing chunks into FTS5 index on migration", async () => {
      const freshSqlite = new DatabaseSync(":memory:")
      const executor: MigrationExecutor = {
        async execute(sql: string) {
          freshSqlite.exec(sql)
        },
        async query<T = unknown>(sql: string): Promise<T[]> {
          return freshSqlite.prepare(sql).all() as T[]
        },
      }

      // Manually run initial base migrations (0000, 0001, 0002, 0003)
      freshSqlite.exec(`
        CREATE TABLE documents (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          original_path TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          mime_type TEXT NOT NULL,
          checksum TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE document_chunks (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          char_start INTEGER,
          char_end INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)

      // Insert existing chunk before running full migration suite
      freshSqlite.exec(`
        INSERT INTO document_chunks (id, document_id, page_number, chunk_index, content, created_at, updated_at)
        VALUES ('pre-1', 'doc-pre', 1, 0, 'Pre-existing chunk prior to FTS migration', '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z');
      `)

      // Now run migration runner which applies 0004
      await runMigrations(executor)

      const ftsRows = freshSqlite
        .prepare("SELECT chunk_id, content FROM document_chunks_fts WHERE chunk_id = 'pre-1'")
        .all() as { chunk_id: string; content: string }[]

      expect(ftsRows).toHaveLength(1)
      expect(ftsRows[0].content).toContain("Pre-existing chunk prior to FTS migration")
    })
  })

  describe("Chunk Indexing & Synchronization", () => {
    it("automatically indexes chunks when inserted via DocumentChunkRepository", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "test.pdf", "sum-sync-1")


      const chunks: NewDocumentChunkRecord[] = [
        {
          id: "chunk-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "The annual financial report indicates revenue growth of 15 percent.",
          charStart: 0,
          charEnd: 68,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "chunk-2",
          documentId: doc.id,
          pageNumber: 2,
          chunkIndex: 1,
          content: "Operating expenses remained stable throughout the fourth fiscal quarter.",
          charStart: 0,
          charEnd: 71,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      await ctx.chunkRepo.saveChunks(doc.id, chunks)

      const count = await ctx.ftsService.count()
      expect(count).toBe(2)

      const results = await ctx.ftsService.search("revenue growth")
      expect(results).toHaveLength(1)
      expect(results[0].chunkId).toBe("chunk-1")
      expect(results[0].pageNumber).toBe(1)
    })

    it("removes stale indexed content when chunks are replaced (re-chunking)", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "contract.pdf", "sum-sync-2")

      // Initial chunk with unique keyword 'confidentiality_v1'
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "old-chunk-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "The confidentiality_v1 clause governs non-disclosure obligations.",
          charStart: 0,
          charEnd: 64,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      expect(await ctx.ftsService.search("confidentiality_v1")).toHaveLength(1)

      // Replace chunks (e.g. re-processing with updated OCR or chunk size)
      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "new-chunk-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "The confidentiality_v2 agreement supersedes all prior covenants.",
          charStart: 0,
          charEnd: 64,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      // Old unique keyword must be gone
      const oldResults = await ctx.ftsService.search("confidentiality_v1")
      expect(oldResults).toHaveLength(0)

      // New unique keyword must be indexed
      const newResults = await ctx.ftsService.search("confidentiality_v2")
      expect(newResults).toHaveLength(1)
      expect(newResults[0].chunkId).toBe("new-chunk-1")
    })

    it("removes indexed content when chunks are deleted by document", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "delete_test.pdf", "sum-sync-3")

      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "del-chunk-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "UniqueTermDeletionShouldBeRemoved immediately from index.",
          charStart: 0,
          charEnd: 56,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      expect(await ctx.ftsService.search("UniqueTermDeletionShouldBeRemoved")).toHaveLength(1)

      await ctx.chunkRepo.deleteByDocumentId(doc.id)

      expect(await ctx.ftsService.search("UniqueTermDeletionShouldBeRemoved")).toHaveLength(0)
      expect(await ctx.ftsService.count()).toBe(0)
    })
  })

  describe("Lexical Search & Provenance", () => {
    let docA: { id: string }
    let docB: { id: string }

    beforeEach(async () => {
      docA = await createTestDoc(ctx.documentRepo, "invoice_doc.pdf", "sum-search-1")
      docB = await createTestDoc(ctx.documentRepo, "policy_doc.pdf", "sum-search-2")

      await ctx.chunkRepo.saveChunks(docA.id, [
        {
          id: "chunk-a1",
          documentId: docA.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Invoice payment deadline is strictly set to March 31, 2026.",
          charStart: 10,
          charEnd: 69,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "chunk-a2",
          documentId: docA.id,
          pageNumber: 2,
          chunkIndex: 1,
          content: "Failure to meet payment deadline results in penalty fee charges.",
          charStart: 100,
          charEnd: 164,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      await ctx.chunkRepo.saveChunks(docB.id, [
        {
          id: "chunk-b1",
          documentId: docB.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Travel expense reimbursement policy requires original receipts.",
          charStart: 0,
          charEnd: 63,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "chunk-b2",
          documentId: docB.id,
          pageNumber: 3,
          chunkIndex: 1,
          content: "Employees must submit reimbursement requests before the monthly deadline.",
          charStart: 250,
          charEnd: 323,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
    })

    it("performs exact keyword search and preserves exact chunk, document, and page provenance", async () => {
      const results = await ctx.ftsService.search("March")

      expect(results).toHaveLength(1)
      const hit = results[0]
      expect(hit.chunkId).toBe("chunk-a1")
      expect(hit.documentId).toBe(docA.id)
      expect(hit.pageNumber).toBe(1)
      expect(hit.chunkIndex).toBe(0)
      expect(hit.charStart).toBe(10)
      expect(hit.charEnd).toBe(69)
      expect(hit.content).toContain("March 31, 2026")
    })

    it("generates contextual snippet excerpts with highlight tags", async () => {
      const results = await ctx.ftsService.search("reimbursement", {
        highlightPreTag: "<b>",
        highlightPostTag: "</b>",
        snippetMaxTokens: 10,
      })

      expect(results.length).toBeGreaterThan(0)
      for (const res of results) {
        expect(res.snippet).toContain("<b>")
        expect(res.snippet).toContain("</b>")
        expect(res.snippet).toMatch(/<b>reimbursement<\/b>/i)
      }
    })

    it("finds multiple matching chunks across different documents and pages", async () => {
      const results = await ctx.ftsService.search("deadline")

      expect(results).toHaveLength(3)
      const docIds = results.map((r) => r.documentId)
      expect(docIds).toContain(docA.id)
      expect(docIds).toContain(docB.id)

      const pages = results.map((r) => r.pageNumber)
      expect(pages).toContain(1)
      expect(pages).toContain(2)
      expect(pages).toContain(3)
    })

    it("supports document scope filtering to restrict candidate search", async () => {
      const allResults = await ctx.ftsService.search("deadline")
      expect(allResults).toHaveLength(3)

      const scopedResults = await ctx.ftsService.search("deadline", {
        documentId: docB.id,
      })

      expect(scopedResults).toHaveLength(1)
      expect(scopedResults[0].documentId).toBe(docB.id)
      expect(scopedResults[0].chunkId).toBe("chunk-b2")
      expect(scopedResults[0].pageNumber).toBe(3)
    })

    it("ranks chunks by BM25 relevance score", async () => {
      // Chunk with high term frequency vs single occurrence
      const docRank = await createTestDoc(ctx.documentRepo, "ranking_doc.pdf", "sum-rank-1")

      await ctx.chunkRepo.saveChunks(docRank.id, [
        {
          id: "rank-low",
          documentId: docRank.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Audit review process is conducted once every financial year.",
          charStart: 0,
          charEnd: 61,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "rank-high",
          documentId: docRank.id,
          pageNumber: 2,
          chunkIndex: 1,
          content: "Audit checklist: internal audit, external audit, and compliance audit guidelines.",
          charStart: 0,
          charEnd: 81,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      const results = await ctx.ftsService.search("audit")
      expect(results).toHaveLength(2)
      // Highest frequency chunk should have a lower/more negative BM25 score and rank first
      expect(results[0].chunkId).toBe("rank-high")
      expect(results[1].chunkId).toBe("rank-low")
      expect(results[0].score).toBeLessThan(results[1].score)
    })

    it("supports pagination with limit and offset", async () => {
      const page1 = await ctx.ftsService.search("deadline", { limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)

      const page2 = await ctx.ftsService.search("deadline", { limit: 2, offset: 2 })
      expect(page2).toHaveLength(1)

      // Chunks across pages should not overlap
      const idsPage1 = page1.map((c) => c.chunkId)
      expect(idsPage1).not.toContain(page2[0].chunkId)
    })
  })

  describe("Query Sanitization & Safety", () => {
    it("safely handles empty string and whitespace-only queries", async () => {
      expect(await ctx.ftsService.search("")).toEqual([])
      expect(await ctx.ftsService.search("    ")).toEqual([])
      expect(await ctx.ftsService.search("\t\n")).toEqual([])
    })

    it("safely handles queries containing only punctuation and special symbols", async () => {
      expect(await ctx.ftsService.search(":::*")).toEqual([])
      expect(await ctx.ftsService.search("!@#$%^&*()")).toEqual([])
      expect(await ctx.ftsService.search("---")).toEqual([])
    })

    it("safely handles special FTS5 operators and malformed syntax without throwing errors", async () => {
      // Colon operator (normally used for column specifier in FTS5)
      const resColon = await ctx.ftsService.search("title: deadline")
      expect(Array.isArray(resColon)).toBe(true)

      // Unmatched quotes
      const resQuote = await ctx.ftsService.search('"deadline without closing quote')
      expect(Array.isArray(resQuote)).toBe(true)

      // Asterisk and boolean operators
      const resOperators = await ctx.ftsService.search("deadline* AND NOT OR")
      expect(Array.isArray(resOperators)).toBe(true)
    })

    it("returns empty array for non-matching queries", async () => {
      const results = await ctx.ftsService.search("NonExistentTermZxyW12345")
      expect(results).toEqual([])
    })
  })

  describe("Rebuild Index Capability", () => {
    it("can completely rebuild the FTS5 secondary index from document_chunks source of truth", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "rebuild_test.pdf", "sum-rebuild-1")

      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "reb-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Authoritative chunk data must be restored during full rebuild.",
          charStart: 0,
          charEnd: 62,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      expect(await ctx.ftsService.count()).toBe(1)

      // Manually wipe FTS virtual table directly to simulate corrupt or missing index
      ctx.sqlite.exec("DELETE FROM document_chunks_fts;")
      expect(await ctx.ftsService.count()).toBe(0)
      expect(await ctx.ftsService.search("Authoritative")).toHaveLength(0)

      // Rebuild index from authoritative document_chunks
      await ctx.ftsService.rebuildIndex()

      expect(await ctx.ftsService.count()).toBe(1)
      const results = await ctx.ftsService.search("Authoritative")
      expect(results).toHaveLength(1)
      expect(results[0].chunkId).toBe("reb-1")
    })
  })

  describe("Unicode & Vietnamese Full-Text Search", () => {
    it("accurately indexes and searches Vietnamese accented text", async () => {
      const doc = await createTestDoc(ctx.documentRepo, "hop_dong.pdf", "sum-vn-1")

      await ctx.chunkRepo.saveChunks(doc.id, [
        {
          id: "vn-1",
          documentId: doc.id,
          pageNumber: 1,
          chunkIndex: 0,
          content: "Hợp đồng dịch vụ tư vấn quản lý doanh nghiệp và thẩm định tài sản.",
          charStart: 0,
          charEnd: 67,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "vn-2",
          documentId: doc.id,
          pageNumber: 2,
          chunkIndex: 1,
          content: "Thời hạn thanh toán hóa đơn giá trị gia tăng chậm nhất ngày 15 hàng tháng.",
          charStart: 0,
          charEnd: 74,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])

      const resHopDong = await ctx.ftsService.search("Hợp đồng")
      expect(resHopDong).toHaveLength(1)
      expect(resHopDong[0].chunkId).toBe("vn-1")

      const resHoaDon = await ctx.ftsService.search("hóa đơn")
      expect(resHoaDon).toHaveLength(1)
      expect(resHoaDon[0].chunkId).toBe("vn-2")

      const resThanhToan = await ctx.ftsService.search("thanh toán")
      expect(resThanhToan).toHaveLength(1)
      expect(resThanhToan[0].chunkId).toBe("vn-2")
    })
  })
})
