import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentIngestionService } from "@/services/ingestionService"

function createCascadeTestContext() {
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
  const storageService = new InMemoryStorageService()
  const ingestionService = new DocumentIngestionService(
    documentRepo,
    jobRepo,
    storageService
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    storageService,
    ingestionService,
  }
}

describe("Document Cascade Delete Integration Test Suite", () => {
  it("creates document with all dependent entities, deletes document, and verifies zero orphans", async () => {
    const ctx = createCascadeTestContext()
    await runMigrations(ctx.executor)

    // 1. Ingest document -> creates document & processing_jobs & physical file
    const ingestResult = await ctx.ingestionService.ingestDocument("C:/docs/Hop_dong_2026.pdf")
    const docId = ingestResult.document.id
    const storagePath = ingestResult.document.storagePath

    expect(ctx.storageService.hasFile(storagePath)).toBe(true)

    const now = new Date().toISOString()

    // 2. Insert document_pages
    ctx.sqlite.prepare(`
      INSERT INTO document_pages (id, document_id, page_number, text_content, char_count, has_sufficient_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`page-${docId}-1`, docId, 1, "Trang hop dong 1", 17, 1, now, now)

    // 3. Insert document_chunks (trigger trg_document_chunks_fts_ai automatically inserts into document_chunks_fts)
    ctx.sqlite.prepare(`
      INSERT INTO document_chunks (id, document_id, page_number, chunk_index, content, char_start, char_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`chunk-${docId}-1`, docId, 1, 0, "Doan hop dong trich xuat", 0, 24, now, now)

    // 4. Insert document_chunk_embeddings
    ctx.sqlite.prepare(`
      INSERT INTO document_chunk_embeddings (id, chunk_id, document_id, model, dimensions, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`emb-${docId}-1`, `chunk-${docId}-1`, docId, "jina-embeddings-v2-base-en", 768, "[-0.1, 0.2]", now, now)

    // 5. Insert document_analyses
    ctx.sqlite.prepare(`
      INSERT INTO document_analyses (id, document_id, version, is_active, status, provider, model, document_type, summary, raw_result, created_at, updated_at)
      VALUES (?, ?, 1, 1, 'completed', 'openai', 'gpt-4o-mini', 'CONTRACT', 'Tom tat hop dong', '{}', ?, ?)
    `).run(`analysis-${docId}-1`, docId, now, now)

    // 6. Insert tasks
    ctx.sqlite.prepare(`
      INSERT INTO tasks (id, document_id, analysis_id, title, status, deadline_type, deadline_date, semantic_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', 'exact', '2026-10-15', 'VERIFIED', ?, ?)
    `).run(`task-${docId}-1`, docId, `analysis-${docId}-1`, "Thanh toan tien dot 1", now, now)

    // 7. Insert calendar_events
    ctx.sqlite.prepare(`
      INSERT INTO calendar_events (id, task_id, document_id, provider, title, start_date, end_date, timezone, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'internal', 'Thanh toan tien dot 1', '2026-10-15T09:00:00Z', '2026-10-15T10:00:00Z', 'Asia/Ho_Chi_Minh', 'scheduled', ?, ?, ?)
    `).run(`cal-${docId}-1`, `task-${docId}-1`, docId, `key-${docId}-1`, now, now)

    // 8. Insert reminders
    ctx.sqlite.prepare(`
      INSERT INTO reminders (id, task_id, document_id, provider, reminder_type, scheduled_at, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'internal', 'notification', '2026-10-14T09:00:00Z', 'pending', ?, ?, ?)
    `).run(`rem-${docId}-1`, `task-${docId}-1`, docId, `rem-key-${docId}-1`, now, now)

    // Verify all records exist prior to deletion
    const getCount = (table: string) => {
      const stmt = ctx.sqlite.prepare(`SELECT count(*) as c FROM ${table}`)
      return (stmt.get() as { c: number }).c
    }

    expect(getCount("documents")).toBe(1)
    expect(getCount("document_pages")).toBe(1)
    expect(getCount("document_chunks")).toBe(1)
    expect(getCount("document_chunks_fts")).toBe(1)
    expect(getCount("document_chunk_embeddings")).toBe(1)
    expect(getCount("document_analyses")).toBe(1)
    expect(getCount("tasks")).toBe(1)
    expect(getCount("processing_jobs")).toBe(1)
    expect(getCount("calendar_events")).toBe(1)
    expect(getCount("reminders")).toBe(1)
    expect(ctx.storageService.hasFile(storagePath)).toBe(true)

    // Execute Delete
    const deleted = await ctx.ingestionService.deleteDocument(docId)
    expect(deleted).toBe(true)

    // Verify all 10 tables are completely purged of related data (no orphans)
    expect(getCount("documents")).toBe(0)
    expect(getCount("document_pages")).toBe(0)
    expect(getCount("document_chunks")).toBe(0)
    expect(getCount("document_chunks_fts")).toBe(0)
    expect(getCount("document_chunk_embeddings")).toBe(0)
    expect(getCount("document_analyses")).toBe(0)
    expect(getCount("tasks")).toBe(0)
    expect(getCount("processing_jobs")).toBe(0)
    expect(getCount("calendar_events")).toBe(0)
    expect(getCount("reminders")).toBe(0)

    // Verify physical file was deleted
    expect(ctx.storageService.hasFile(storagePath)).toBe(false)

    // Second delete should be idempotent and not crash
    const secondDelete = await ctx.ingestionService.deleteDocument(docId)
    expect(secondDelete).toBe(false)
  })

  it("does not delete unrelated documents or records", async () => {
    const ctx = createCascadeTestContext()
    await runMigrations(ctx.executor)

    const doc1 = await ctx.ingestionService.ingestDocument("C:/docs/Doc1.pdf")
    const doc2 = await ctx.ingestionService.ingestDocument("C:/docs/Doc2.pdf")

    expect(ctx.storageService.hasFile(doc1.document.storagePath)).toBe(true)
    expect(ctx.storageService.hasFile(doc2.document.storagePath)).toBe(true)

    // Delete only doc1
    const res = await ctx.ingestionService.deleteDocument(doc1.document.id)
    expect(res).toBe(true)

    // Check doc1 is gone, doc2 remains intact
    const remainingDoc = await ctx.documentRepo.findById(doc2.document.id)
    expect(remainingDoc).not.toBeNull()
    expect(remainingDoc?.id).toBe(doc2.document.id)

    expect(ctx.storageService.hasFile(doc1.document.storagePath)).toBe(false)
    expect(ctx.storageService.hasFile(doc2.document.storagePath)).toBe(true)

    const jobs = await ctx.jobRepo.findByDocumentId(doc2.document.id)
    expect(jobs.length).toBeGreaterThan(0)
  })
})
