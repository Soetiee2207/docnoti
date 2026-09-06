import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { DocumentChunkEmbeddingRepository } from "@/repositories/documentChunkEmbeddingRepository"
import { AnalysisRepository } from "@/repositories/analysisRepository"
import { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import { FtsSearchService } from "@/services/search/ftsSearchService"
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
} from "@/services/embedding"
import { HybridRetrievalService } from "@/services/retrieval"
import {
  AnalysisService,
  MockAIProvider,
  type AIProvider,
  type AnalysisRequest,
  type AnalysisResult,
} from "@/services/ai"
import type {
  NewDocumentRecord,
  NewDocumentPageRecord,
  NewDocumentChunkRecord,
} from "@/db/schema"

function createTestContext() {
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
  const pageRepo = new DocumentPageRepository(db)
  const chunkRepo = new DocumentChunkRepository(db)
  const embeddingRepo = new DocumentChunkEmbeddingRepository(db)
  const analysisRepo = new AnalysisRepository(db)
  const ftsRepo = new FtsSearchRepository(db)
  const ftsService = new FtsSearchService(ftsRepo)
  const embeddingProvider = new DeterministicEmbeddingProvider()
  const hybridRetrievalService = new HybridRetrievalService(
    ftsService,
    embeddingRepo,
    embeddingProvider
  )
  const mockAiProvider = new MockAIProvider()

  const analysisService = new AnalysisService({
    aiProvider: mockAiProvider,
    documentRepo,
    pageRepo,
    analysisRepo,
    hybridRetrievalService,
  })

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    pageRepo,
    chunkRepo,
    embeddingRepo,
    analysisRepo,
    ftsRepo,
    ftsService,
    embeddingProvider,
    hybridRetrievalService,
    mockAiProvider,
    analysisService,
  }
}

let docCounter = 0
async function seedDocumentWithChunks(
  ctx: ReturnType<typeof createTestContext>,
  name: string = "lease_agreement.pdf"
): Promise<{ docId: string; chunkIds: string[] }> {
  docCounter++
  const docId = `doc-rag-${Date.now()}-${docCounter}`
  const now = new Date().toISOString()

  const doc: NewDocumentRecord = {
    id: docId,
    name,
    originalPath: `/mock/${name}`,
    storagePath: `/mock/storage/${name}`,
    fileSize: 4096,
    mimeType: "application/pdf",
    checksum: `chk-${Date.now()}-${docCounter}`,
    status: "processed",
    createdAt: now,
    updatedAt: now,
  }
  await ctx.documentRepo.create(doc)

  // Page 1: Unrelated introductory clauses (e.g. 500 chars)
  const page1Text =
    "PREAMBLE AND PARTIES: This residential lease agreement is entered into between Landlord and Tenant on January 1, 2026. Both parties agree to the following terms and provisions governing the occupancy of the property located in District 1."
  // Page 2: Targeted financial clauses
  const page2Text =
    "RENT AND SECURITY DEPOSIT: The monthly rent shall be exactly $2,500 due on the first day of each month. A security deposit of $5,000 is required upon signing and will be held in escrow until lease expiration."
  // Page 3: Termination clauses
  const page3Text =
    "TERMINATION AND NOTICE: Either party may terminate this agreement by providing thirty days written notice prior to the end of the rental term."

  const pages: NewDocumentPageRecord[] = [
    {
      id: `p-${docId}-1`,
      documentId: docId,
      pageNumber: 1,
      textContent: page1Text,
      charCount: page1Text.length,
      hasSufficientText: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `p-${docId}-2`,
      documentId: docId,
      pageNumber: 2,
      textContent: page2Text,
      charCount: page2Text.length,
      hasSufficientText: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `p-${docId}-3`,
      documentId: docId,
      pageNumber: 3,
      textContent: page3Text,
      charCount: page3Text.length,
      hasSufficientText: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]
  await ctx.pageRepo.savePages(docId, pages)

  const chunks: NewDocumentChunkRecord[] = [
    {
      id: `c-${docId}-0`,
      documentId: docId,
      pageNumber: 1,
      chunkIndex: 0,
      content: page1Text,
      charStart: 0,
      charEnd: page1Text.length,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `c-${docId}-1`,
      documentId: docId,
      pageNumber: 2,
      chunkIndex: 1,
      content: page2Text,
      charStart: 0,
      charEnd: page2Text.length,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `c-${docId}-2`,
      documentId: docId,
      pageNumber: 3,
      chunkIndex: 2,
      content: page3Text,
      charStart: 0,
      charEnd: page3Text.length,
      createdAt: now,
      updatedAt: now,
    },
  ]
  await ctx.chunkRepo.saveChunks(docId, chunks)

  // Generate & save embeddings
  const embeddings = await ctx.embeddingProvider.embedChunks(
    chunks.map((c) => ({ chunkId: c.id, content: c.content }))
  )
  await ctx.embeddingRepo.saveEmbeddings(
    docId,
    embeddings.map((e, idx) => ({
      id: `emb-${docId}-${idx}`,
      chunkId: e.chunkId,
      documentId: docId,
      model: ctx.embeddingProvider.model,
      dimensions: ctx.embeddingProvider.dimensions,
      embedding: JSON.stringify(e.vector),
      createdAt: now,
      updatedAt: now,
    }))
  )

  return { docId, chunkIds: chunks.map((c) => c.id) }
}

describe("Retrieval-Augmented Analysis Integration", () => {
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    ctx = createTestContext()
    await runMigrations(ctx.executor)
  })

  it("invokes HybridRetrievalService, builds bounded context, and sends only bounded text to AIProvider", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    // Spy on AIProvider.analyze to inspect the actual request received
    let capturedRequest: AnalysisRequest | null = null
    const recordingProvider: AIProvider = {
      id: "recording-ai",
      metadata: ctx.mockAiProvider.metadata,
      isAvailable: async () => ({ available: true }),
      analyze: async (req: AnalysisRequest): Promise<AnalysisResult> => {
        capturedRequest = req
        return ctx.mockAiProvider.analyze(req)
      },
    }
    ctx.analysisService.setProvider(recordingProvider)

    // Targeted retrieval query focusing on "security deposit" with budget limiting to top 1 chunk
    const analysisRes = await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "security deposit monthly rent",
      { budget: { maxChunks: 1 } }
    )

    expect(capturedRequest).not.toBeNull()
    expect(capturedRequest?.options?.isRetrievalGrounded).toBe(true)
    expect(capturedRequest?.options?.query).toBe("security deposit monthly rent")

    // The bounded request sent to AIProvider must ONLY contain Page 2 (the matching chunk),
    // NOT the full raw document text from Pages 1 and 3!
    expect(capturedRequest?.pages.length).toBeLessThan(3)
    const page2Entry = capturedRequest?.pages.find((p) => p.pageNumber === 2)
    expect(page2Entry).toBeDefined()
    expect(page2Entry?.text).toContain("security deposit of $5,000")

    // Page 1 and Page 3 were not relevant and must not be in the prompt context
    const page1Entry = capturedRequest?.pages.find((p) => p.pageNumber === 1)
    expect(page1Entry).toBeUndefined()

    // Context details preserved in return object
    expect(analysisRes.context).toBeDefined()
    expect(analysisRes.context?.chunks.length).toBeGreaterThan(0)
    expect(analysisRes.context?.chunks[0]?.pageNumber).toBe(2)
    expect(analysisRes.context?.chunks[0]?.retrievalSources).toBe("both")

    // Persisted record created
    expect(analysisRes.record).toBeDefined()
    expect(analysisRes.record?.documentId).toBe(docId)
  })

  it("strictly validates evidence against supplied context (downgrading quotes from unsupplied pages)", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    // Create a provider that hallucinates citations from Page 1 (which was NOT supplied in context for rent query)
    const hallucinatingProvider: AIProvider = {
      id: "hallucinating-provider",
      metadata: ctx.mockAiProvider.metadata,
      isAvailable: async () => ({ available: true }),
      analyze: async (req: AnalysisRequest): Promise<AnalysisResult> => {
        return {
          documentId: req.documentId,
          documentType: "CONTRACT",
          summary: "Summary of contract",
          fields: [
            {
              name: "parties",
              value: "Landlord and Tenant",
              semanticStatus: "VERIFIED",
              confidence: 0.99,
              evidence: {
                claim: "Parties identified on page 1",
                status: "VERIFIED",
                confidence: 0.99,
                citations: [
                  {
                    pageNumber: 1, // Page 1 was NOT provided in the retrieval context!
                    sourceText: "This residential lease agreement is entered into",
                  },
                ],
              },
            },
          ],
          evidences: [],
          warnings: [],
          provider: "mock",
          model: "mock-v1",
          analyzedAt: new Date().toISOString(),
        }
      },
    }
    ctx.analysisService.setProvider(hallucinatingProvider)

    // Execute targeted query which only retrieves Page 2 with budget limiting to 1 chunk
    const res = await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "security deposit monthly rent",
      { budget: { maxChunks: 1 } }
    )

    // Field evidence must be downgraded to UNCERTAIN because Page 1 was NOT provided in the analysis context
    const field = res.result.fields[0]!
    expect(field.semanticStatus).toBe("UNCERTAIN")
    expect(field.evidence.status).toBe("UNCERTAIN")

    // Warning recorded: EVIDENCE_PAGE_NOT_FOUND
    const warning = res.result.warnings.find(
      (w) => w.code === "EVIDENCE_PAGE_NOT_FOUND"
    )
    expect(warning).toBeDefined()
    expect(warning?.pageNumber).toBe(1)
  })

  it("handles vector-degraded mode: proceeds via lexical retrieval with warning diagnostic", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    // Create a degraded retrieval service where vector is unavailable
    const unavailableEmbeddingProvider: EmbeddingProvider = {
      name: "UnavailableProvider",
      model: ctx.embeddingProvider.model,
      dimensions: ctx.embeddingProvider.dimensions,
      getMetadata: ctx.embeddingProvider.getMetadata,
      embedChunks: async () => [],
      embedText: async () => {
        throw new Error("Local model weights missing")
      },
      isAvailable: async () => false,
    }

    const degradedRetrieval = new HybridRetrievalService(
      ctx.ftsService,
      ctx.embeddingRepo,
      unavailableEmbeddingProvider
    )
    ctx.analysisService.setHybridRetrievalService(degradedRetrieval)

    const res = await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "security deposit"
    )

    // Context should still be built from lexical FTS5 hits
    expect(res.context?.chunks.length).toBeGreaterThan(0)
    expect(res.context?.chunks[0]?.retrievalSources).toBe("lexical")

    // Warning must be present indicating degraded vector mode
    const degradedWarn = res.result.warnings.find(
      (w) => w.code === "RETRIEVAL_DEGRADED"
    )
    expect(degradedWarn).toBeDefined()
    expect(degradedWarn?.message).toContain("Vector retrieval degraded")
  })

  it("handles no-result retrieval: produces explicit empty context and annotates warning", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    let capturedReq: AnalysisRequest | null = null
    const capturingProvider: AIProvider = {
      id: "capture-ai",
      metadata: ctx.mockAiProvider.metadata,
      isAvailable: async () => ({ available: true }),
      analyze: async (req: AnalysisRequest): Promise<AnalysisResult> => {
        capturedReq = req
        return ctx.mockAiProvider.analyze(req)
      },
    }
    ctx.analysisService.setProvider(capturingProvider)

    const res = await ctx.analysisService.analyzeWithRetrieval(
      docId,
      "nonexistent_unique_term_xyz_123",
      { minVectorScore: 0.8 }
    )

    // Explicit empty context produced
    expect(res.context?.chunks).toHaveLength(0)
    expect(capturedReq?.pages).toHaveLength(0)

    // Warning added: NO_RETRIEVAL_CANDIDATES
    const noCandWarn = res.result.warnings.find(
      (w) => w.code === "NO_RETRIEVAL_CANDIDATES"
    )
    expect(noCandWarn).toBeDefined()
  })

  it("surfaces retrieval infrastructure failures honestly rather than silently pretending success", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    // Mock retrieval throwing an infrastructure error
    const failingRetrieval = {
      retrieve: async () => {
        throw new Error("SQLite disk I/O failure on index read")
      },
    } as unknown as HybridRetrievalService

    ctx.analysisService.setHybridRetrievalService(failingRetrieval)

    await expect(
      ctx.analysisService.analyzeWithRetrieval(docId, "some query")
    ).rejects.toThrow("Retrieval infrastructure failure during analysis: SQLite disk I/O failure")
  })

  it("routes analyzeDocument() to retrieval when query or mode='retrieval' is provided", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    const spy = vi.spyOn(ctx.analysisService, "analyzeWithRetrieval")

    // Call analyzeDocument with query
    await ctx.analysisService.analyzeDocument(docId, {
      query: "monthly rent",
    })

    expect(spy).toHaveBeenCalledWith(docId, "monthly rent", expect.anything())
  })

  it("preserves full-document summary mode when no query is provided", async () => {
    const { docId } = await seedDocumentWithChunks(ctx)

    let capturedReq: AnalysisRequest | null = null
    const capturingProvider: AIProvider = {
      id: "capture-ai",
      metadata: ctx.mockAiProvider.metadata,
      isAvailable: async () => ({ available: true }),
      analyze: async (req: AnalysisRequest): Promise<AnalysisResult> => {
        capturedReq = req
        return ctx.mockAiProvider.analyze(req)
      },
    }
    ctx.analysisService.setProvider(capturingProvider)

    // Full document summary mode (e.g. background worker default)
    const res = await ctx.analysisService.analyzeDocument(docId)

    // Receives all 3 pages
    expect(capturedReq?.pages).toHaveLength(3)
    expect(res.context).toBeUndefined()
    expect(res.result).toBeDefined()
  })
})
