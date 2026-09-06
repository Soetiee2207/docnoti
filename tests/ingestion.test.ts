import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { InMemoryStorageService } from "@/services/storage"
import {
  DocumentIngestionService,
  IngestionValidationError,
  DuplicateDocumentError,
} from "@/services/ingestionService"

function createTestContext() {
  const sqlite = new DatabaseSync(":memory:")

  // Run migrations
  const executor: MigrationExecutor = {
    async execute(sql: string) {
      sqlite.exec(sql)
    },
    async query<T = unknown>(sql: string): Promise<T[]> {
      const stmt = sqlite.prepare(sql)
      return stmt.all() as T[]
    },
  }

  // Create Drizzle proxy driver bridging node:sqlite
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

describe("Document Ingestion V1 Test Suite", () => {
  it("executes schema migrations successfully", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    const count = await ctx.documentRepo.count()
    expect(count).toBe(0)
  })

  it("imports valid PDF, creates Document record and persistent ProcessingJob", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    const result = await ctx.ingestionService.ingestDocument("C:/docs/Hop_dong_2026.pdf")

    // Verify Document record
    expect(result.document.id).toBeTruthy()
    expect(result.document.name).toBe("Hop_dong_2026.pdf")
    expect(result.document.originalPath).toBe("C:/docs/Hop_dong_2026.pdf")
    expect(result.document.mimeType).toBe("application/pdf")
    expect(result.document.status).toBe("imported")
    expect(result.document.storagePath).toContain(".pdf")
    expect(result.document.checksum.length).toBeGreaterThan(0)
    expect(result.document.createdAt).toBeTruthy()
    expect(result.document.updatedAt).toBeTruthy()

    // Verify file is persisted in managed storage
    expect(ctx.storageService.hasFile(result.document.storagePath)).toBe(true)

    // Verify ProcessingJob
    expect(result.job.id).toBeTruthy()
    expect(result.job.documentId).toBe(result.document.id)
    expect(result.job.jobType).toBe("document_pipeline")
    expect(result.job.status).toBe("pending")
    expect(result.job.retryCount).toBe(0)
    expect(result.job.maxRetries).toBe(3)
    expect(result.job.errorMessage).toBeNull()

    // Verify records can be retrieved from DB
    const fetchedDoc = await ctx.documentRepo.findById(result.document.id)
    expect(fetchedDoc).not.toBeNull()
    expect(fetchedDoc?.name).toBe("Hop_dong_2026.pdf")

    const fetchedJobs = await ctx.jobRepo.findByDocumentId(result.document.id)
    expect(fetchedJobs.length).toBe(1)
    expect(fetchedJobs[0].status).toBe("pending")
  })

  it("rejects non-PDF files", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    await expect(
      ctx.ingestionService.ingestDocument("C:/docs/document.docx")
    ).rejects.toThrow(IngestionValidationError)

    await expect(
      ctx.ingestionService.ingestDocument("C:/docs/notes.txt")
    ).rejects.toThrow(IngestionValidationError)

    await expect(
      ctx.ingestionService.ingestDocument("   ")
    ).rejects.toThrow(IngestionValidationError)

    const count = await ctx.documentRepo.count()
    expect(count).toBe(0)
  })

  it("prevents accidental duplicate document import by checksum", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    const first = await ctx.ingestionService.ingestDocument("C:/docs/Thong_bao.pdf")
    expect(first.document.id).toBeTruthy()

    // Re-importing same file must fail with DuplicateDocumentError
    await expect(
      ctx.ingestionService.ingestDocument("C:/docs/Thong_bao.pdf")
    ).rejects.toThrow(DuplicateDocumentError)

    const count = await ctx.documentRepo.count()
    expect(count).toBe(1)
  })

  it("rolls back and cleans up storage when database insertion fails", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    // Force DB creation failure
    ctx.documentRepo.create = async () => {
      throw new Error("Simulated SQLite database error")
    }

    let storagePathChecked = ""
    const origImport = ctx.storageService.importPdf.bind(ctx.storageService)
    ctx.storageService.importPdf = async (path) => {
      const res = await origImport(path)
      storagePathChecked = res.storagePath
      return res
    }

    await expect(
      ctx.ingestionService.ingestDocument("C:/docs/failed.pdf")
    ).rejects.toThrow("Simulated SQLite database error")

    // The copied file must have been deleted from storage during rollback!
    expect(storagePathChecked).toBeTruthy()
    expect(ctx.storageService.hasFile(storagePathChecked)).toBe(false)

    const count = await ctx.documentRepo.count()
    expect(count).toBe(0)
  })

  it("handles batch importing of multiple documents", async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)

    const batch = [
      "C:/docs/valid1.pdf",
      "C:/docs/invalid.docx",
      "C:/docs/valid2.pdf",
    ]

    const result = await ctx.ingestionService.ingestMultiple(batch)

    expect(result.succeeded.length).toBe(2)
    expect(result.failed.length).toBe(1)
    expect(result.succeeded[0].document.name).toBe("valid1.pdf")
    expect(result.succeeded[1].document.name).toBe("valid2.pdf")
    expect(result.failed[0].path).toBe("C:/docs/invalid.docx")

    const count = await ctx.documentRepo.count()
    expect(count).toBe(2)
  })
})
