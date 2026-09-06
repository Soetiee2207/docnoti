import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import {
  DocumentChunkEmbeddingRepository,
  cosineSimilarity,
  type VectorSearchCandidate,
} from "@/repositories/documentChunkEmbeddingRepository"
import { FtsSearchService } from "@/services/search/ftsSearchService"
import type { FtsSearchCandidate } from "@/services/search/types"
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingMetadata,
} from "@/services/embedding"
import {
  HybridRetrievalService,
  computeRrf,
} from "@/services/retrieval"
import type { NewDocumentChunkRecord, NewDocumentRecord } from "@/db/schema"

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
  const chunkRepo = new DocumentChunkRepository(db)
  const ftsRepo = new FtsSearchRepository(db)
  const ftsService = new FtsSearchService(ftsRepo)
  const embeddingRepo = new DocumentChunkEmbeddingRepository(db)
  const embeddingProvider = new DeterministicEmbeddingProvider()
  const hybridService = new HybridRetrievalService(
    ftsService,
    embeddingRepo,
    embeddingProvider
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    chunkRepo,
    ftsRepo,
    ftsService,
    embeddingRepo,
    embeddingProvider,
    hybridService,
  }
}

let docCounter = 0
async function createTestDoc(
  repo: DocumentRepository,
  name: string = "sample.pdf"
): Promise<string> {
  docCounter++
  const id = `doc-${Date.now()}-${docCounter}`
  const now = new Date().toISOString()
  const doc: NewDocumentRecord = {
    id,
    name,
    originalPath: `/mock/${name}`,
    storagePath: `/mock/storage/${name}`,
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum: `chk-${Date.now()}-${docCounter}`,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  }
  await repo.create(doc)
  return id
}

describe("Reciprocal Rank Fusion (RRF) - Unit Tests", () => {
  it("calculates exact RRF scores with default k=60", () => {
    const lexical: FtsSearchCandidate[] = [
      {
        chunkId: "c1",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 0,
        content: "lexical first",
        snippet: "first",
        score: -10.5,
        charStart: 0,
        charEnd: 13,
      },
      {
        chunkId: "c2",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 1,
        content: "lexical second",
        snippet: "second",
        score: -5.2,
        charStart: 14,
        charEnd: 28,
      },
    ]

    const vector: VectorSearchCandidate[] = []

    const results = computeRrf(lexical, vector)

    expect(results).toHaveLength(2)
    // Rank 1: 1 / (60 + 1) = 1/61
    expect(results[0]?.chunkId).toBe("c1")
    expect(results[0]?.fusedScore).toBeCloseTo(1 / 61, 6)
    expect(results[0]?.lexicalRank).toBe(1)
    expect(results[0]?.vectorRank).toBeNull()
    expect(results[0]?.retrievalSources).toBe("lexical")

    // Rank 2: 1 / (60 + 2) = 1/62
    expect(results[1]?.chunkId).toBe("c2")
    expect(results[1]?.fusedScore).toBeCloseTo(1 / 62, 6)
    expect(results[1]?.lexicalRank).toBe(2)
    expect(results[1]?.retrievalSources).toBe("lexical")
  })

  it("supports configurable k value", () => {
    const lexical: FtsSearchCandidate[] = [
      {
        chunkId: "c1",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 0,
        content: "chunk 1",
        snippet: "c1",
        score: -1.0,
        charStart: 0,
        charEnd: 7,
      },
    ]
    const vector: VectorSearchCandidate[] = []

    const results = computeRrf(lexical, vector, { rrfK: 10 })

    expect(results).toHaveLength(1)
    // Rank 1 with k=10: 1 / (10 + 1) = 1/11
    expect(results[0]?.fusedScore).toBeCloseTo(1 / 11, 6)
  })

  it("deduplicates candidates appearing in both lexical and vector pools", () => {
    const lexical: FtsSearchCandidate[] = [
      {
        chunkId: "both-chunk",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 0,
        content: "common content",
        snippet: "common",
        score: -8.0,
        charStart: 0,
        charEnd: 14,
      },
      {
        chunkId: "lex-only",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 1,
        content: "lexical only",
        snippet: "lexical",
        score: -4.0,
        charStart: 15,
        charEnd: 27,
      },
    ]

    const vector: VectorSearchCandidate[] = [
      {
        chunkId: "vec-only",
        documentId: "d1",
        pageNumber: 2,
        chunkIndex: 0,
        content: "vector only",
        charStart: 0,
        charEnd: 11,
        score: 0.95,
      },
      {
        chunkId: "both-chunk",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 0,
        content: "common content",
        charStart: 0,
        charEnd: 14,
        score: 0.88,
      },
    ]

    const results = computeRrf(lexical, vector, { rrfK: 60 })

    expect(results).toHaveLength(3)

    // "both-chunk" was rank 1 in lexical (1/61) and rank 2 in vector (1/62)
    // total score = 1/61 + 1/62 ≈ 0.0163934 + 0.0161290 = 0.032522
    const bothResult = results.find((r) => r.chunkId === "both-chunk")
    expect(bothResult).toBeDefined()
    expect(bothResult?.retrievalSources).toBe("both")
    expect(bothResult?.lexicalRank).toBe(1)
    expect(bothResult?.vectorRank).toBe(2)
    expect(bothResult?.lexicalScore).toBe(-8.0)
    expect(bothResult?.vectorScore).toBe(0.88)
    expect(bothResult?.fusedScore).toBeCloseTo(1 / 61 + 1 / 62, 6)

    // Should be ranked highest because of both contributions
    expect(results[0]?.chunkId).toBe("both-chunk")

    // Check single-source results
    const vecOnly = results.find((r) => r.chunkId === "vec-only")
    expect(vecOnly?.retrievalSources).toBe("vector")
    expect(vecOnly?.vectorRank).toBe(1)
    expect(vecOnly?.lexicalRank).toBeNull()
    expect(vecOnly?.fusedScore).toBeCloseTo(1 / 61, 6)

    const lexOnly = results.find((r) => r.chunkId === "lex-only")
    expect(lexOnly?.retrievalSources).toBe("lexical")
    expect(lexOnly?.lexicalRank).toBe(2)
    expect(lexOnly?.vectorRank).toBeNull()
    expect(lexOnly?.fusedScore).toBeCloseTo(1 / 62, 6)
  })

  it("breaks score ties deterministically by pageNumber and chunkIndex", () => {
    // Both are at rank 1 in their respective single-source lists, creating equal fusedScore
    const lexical: FtsSearchCandidate[] = [
      {
        chunkId: "page2-chunk0",
        documentId: "d1",
        pageNumber: 2,
        chunkIndex: 0,
        content: "page 2",
        snippet: "snippet",
        score: -1.0,
        charStart: null,
        charEnd: null,
      },
    ]
    const vecOnly: VectorSearchCandidate[] = [
      {
        chunkId: "page1-chunk0",
        documentId: "d1",
        pageNumber: 1,
        chunkIndex: 0,
        content: "page 1 chunk 0",
        charStart: null,
        charEnd: null,
        score: 0.9,
      },
    ]

    // Both have fusedScore = 1/61
    const results = computeRrf(lexical, vecOnly, { rrfK: 60 })
    expect(results).toHaveLength(2)
    expect(results[0]?.fusedScore).toEqual(results[1]?.fusedScore)
    // page 1 must come before page 2
    expect(results[0]?.chunkId).toBe("page1-chunk0")
    expect(results[1]?.chunkId).toBe("page2-chunk0")
  })
})

describe("Vector Similarity Search in SQLite", () => {
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    ctx = createTestContext()
    await runMigrations(ctx.executor)
  })

  it("computes cosine similarity accurately", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0, 5)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5)
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  it("searches persisted chunk embeddings and ranks by cosine similarity", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "contract.pdf")

    const chunks: NewDocumentChunkRecord[] = [
      {
        id: "chunk-a",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Payment terms and monthly fees.",
        charStart: 0,
        charEnd: 32,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "chunk-b",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 1,
        content: "Confidentiality and nondisclosure agreement.",
        charStart: 33,
        charEnd: 77,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    await ctx.chunkRepo.saveChunks(docId, chunks)

    // Save embeddings
    // chunk-a has vector pointing strongly along dimension 0
    // chunk-b has vector pointing along dimension 1
    const vA = [1, 0, 0, 0]
    const vB = [0, 1, 0, 0]

    await ctx.embeddingRepo.saveEmbeddings(docId, [
      {
        id: "emb-a",
        chunkId: "chunk-a",
        documentId: docId,
        model: "test-model",
        dimensions: 4,
        embedding: JSON.stringify(vA),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "emb-b",
        chunkId: "chunk-b",
        documentId: docId,
        model: "test-model",
        dimensions: 4,
        embedding: JSON.stringify(vB),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    // Query close to vA: [0.9, 0.1, 0, 0]
    const queryVector = [0.9, 0.1, 0, 0]
    const results = await ctx.embeddingRepo.searchSimilar(queryVector, {
      model: "test-model",
    })

    expect(results).toHaveLength(2)
    expect(results[0]?.chunkId).toBe("chunk-a")
    expect(results[0]?.content).toBe("Payment terms and monthly fees.")
    expect(results[0]?.charStart).toBe(0)
    expect(results[0]?.charEnd).toBe(32)
    expect(results[0]?.pageNumber).toBe(1)
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0)
  })

  it("respects documentId filtering during vector search", async () => {
    const doc1 = await createTestDoc(ctx.documentRepo, "doc1.pdf")
    const doc2 = await createTestDoc(ctx.documentRepo, "doc2.pdf")

    await ctx.chunkRepo.saveChunks(doc1, [
      {
        id: "c-doc1",
        documentId: doc1,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Doc 1 secret text",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    await ctx.chunkRepo.saveChunks(doc2, [
      {
        id: "c-doc2",
        documentId: doc2,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Doc 2 secret text",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    await ctx.embeddingRepo.saveEmbeddings(doc1, [
      {
        id: "emb-doc1",
        chunkId: "c-doc1",
        documentId: doc1,
        model: "m",
        dimensions: 2,
        embedding: JSON.stringify([1, 0]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    await ctx.embeddingRepo.saveEmbeddings(doc2, [
      {
        id: "emb-doc2",
        chunkId: "c-doc2",
        documentId: doc2,
        model: "m",
        dimensions: 2,
        embedding: JSON.stringify([1, 0]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    const filtered = await ctx.embeddingRepo.searchSimilar([1, 0], {
      documentId: doc1,
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.chunkId).toBe("c-doc1")
    expect(filtered[0]?.documentId).toBe(doc1)
  })
})

describe("Hybrid Retrieval Service - End to End", () => {
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    ctx = createTestContext()
    await runMigrations(ctx.executor)
  })

  it("executes parallel FTS5 and vector search, fusing with RRF", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "invoice.pdf")

    const chunks: NewDocumentChunkRecord[] = [
      {
        id: "inv-chunk-0",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Invoice Number INV-2026-001 for Acme Corporation.",
        charStart: 0,
        charEnd: 49,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "inv-chunk-1",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 1,
        content: "Total due is $1,500.00 payable by March 15, 2026.",
        charStart: 50,
        charEnd: 99,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "inv-chunk-2",
        documentId: docId,
        pageNumber: 2,
        chunkIndex: 2,
        content: "Bank transfer details: Account 12345678, Routing 9876.",
        charStart: 0,
        charEnd: 54,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    await ctx.chunkRepo.saveChunks(docId, chunks)

    // Generate embeddings with DeterministicEmbeddingProvider
    const embedded = await ctx.embeddingProvider.embedChunks(
      chunks.map((c) => ({ chunkId: c.id, content: c.content }))
    )
    await ctx.embeddingRepo.saveEmbeddings(
      docId,
      embedded.map((e, idx) => ({
        id: `emb-${idx}`,
        chunkId: e.chunkId,
        documentId: docId,
        model: ctx.embeddingProvider.model,
        dimensions: ctx.embeddingProvider.dimensions,
        embedding: JSON.stringify(e.vector),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    )

    // Search query matches inv-chunk-1 both lexically ("payable March") and semantically
    const result = await ctx.hybridService.retrieve("payable March 2026")

    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.diagnostics.isDegraded).toBe(false)
    expect(result.diagnostics.queryTimeMs).toBeGreaterThanOrEqual(0)

    const topCandidate = result.candidates[0]!
    expect(topCandidate.chunkId).toBe("inv-chunk-1")
    expect(topCandidate.documentId).toBe(docId)
    expect(topCandidate.pageNumber).toBe(1)
    expect(topCandidate.chunkIndex).toBe(1)
    expect(topCandidate.content).toContain("payable by March 15, 2026")
    expect(topCandidate.charStart).toBe(50)
    expect(topCandidate.charEnd).toBe(99)
    // Appears in both lexical and vector sources
    expect(topCandidate.retrievalSources).toBe("both")
    expect(topCandidate.lexicalRank).toBeDefined()
    expect(topCandidate.vectorRank).toBeDefined()
    expect(topCandidate.fusedScore).toBeGreaterThan(0)
  })

  it("handles queries matching lexical only", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "terms.pdf")

    const chunk: NewDocumentChunkRecord = {
      id: "terms-c1",
      documentId: docId,
      pageNumber: 1,
      chunkIndex: 0,
      content: "Exclusive jurisdiction of Delaware courts.",
      charStart: 0,
      charEnd: 42,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await ctx.chunkRepo.saveChunks(docId, [chunk])

    // Notice: we do NOT add embeddings to document_chunk_embeddings for this chunk
    // So it will only match through FTS5
    const result = await ctx.hybridService.retrieve("Delaware")

    expect(result.candidates).toHaveLength(1)
    const candidate = result.candidates[0]!
    expect(candidate.chunkId).toBe("terms-c1")
    expect(candidate.retrievalSources).toBe("lexical")
    expect(candidate.lexicalRank).toBe(1)
    expect(candidate.vectorRank).toBeNull()
    expect(candidate.vectorScore).toBeNull()
  })

  it("handles queries matching vector only", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "vectors.pdf")

    const chunk: NewDocumentChunkRecord = {
      id: "vec-match-chunk",
      documentId: docId,
      pageNumber: 1,
      chunkIndex: 0,
      content: "Unique dense concept with no keyword overlap.",
      charStart: 0,
      charEnd: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await ctx.chunkRepo.saveChunks(docId, [chunk])

    // Embed the chunk with deterministic provider
    const [embedded] = await ctx.embeddingProvider.embedChunks([
      { chunkId: chunk.id, content: chunk.content },
    ])
    await ctx.embeddingRepo.saveEmbeddings(docId, [
      {
        id: "emb-vec-match",
        chunkId: chunk.id,
        documentId: docId,
        model: ctx.embeddingProvider.model,
        dimensions: ctx.embeddingProvider.dimensions,
        embedding: JSON.stringify(embedded!.vector),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    // Query using the exact chunk content to ensure high vector similarity
    // but test with a mock lexical service that returns no hits
    const mockFts = {
      search: async () => [],
      rebuildIndex: async () => {},
      count: async () => 0,
    } as unknown as FtsSearchService

    const service = new HybridRetrievalService(
      mockFts,
      ctx.embeddingRepo,
      ctx.embeddingProvider
    )

    const result = await service.retrieve(chunk.content)
    expect(result.candidates).toHaveLength(1)
    const candidate = result.candidates[0]!
    expect(candidate.chunkId).toBe("vec-match-chunk")
    expect(candidate.retrievalSources).toBe("vector")
    expect(candidate.vectorRank).toBe(1)
    expect(candidate.lexicalRank).toBeNull()
    expect(candidate.vectorScore).toBeDefined()
  })

  it("respects final limit parameter", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "many.pdf")

    const chunks: NewDocumentChunkRecord[] = Array.from({ length: 15 }, (_, i) => ({
      id: `limit-chunk-${i}`,
      documentId: docId,
      pageNumber: 1,
      chunkIndex: i,
      content: `Item number ${i} for accounting report review.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))

    await ctx.chunkRepo.saveChunks(docId, chunks)

    // Request limit: 3
    const result = await ctx.hybridService.retrieve("accounting report", {
      limit: 3,
    })

    expect(result.candidates.length).toBe(3)
  })

  it("respects document scope filtering", async () => {
    const docA = await createTestDoc(ctx.documentRepo, "reportA.pdf")
    const docB = await createTestDoc(ctx.documentRepo, "reportB.pdf")

    await ctx.chunkRepo.saveChunks(docA, [
      {
        id: "chunk-a",
        documentId: docA,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Quarterly earnings report in financial records.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    await ctx.chunkRepo.saveChunks(docB, [
      {
        id: "chunk-b",
        documentId: docB,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Quarterly earnings report in audit records.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    const result = await ctx.hybridService.retrieve("Quarterly earnings", {
      documentId: docA,
    })

    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0]?.documentId).toBe(docA)
    expect(result.candidates[0]?.chunkId).toBe("chunk-a")
  })

  it("handles empty or whitespace queries safely without error", async () => {
    const emptyResult = await ctx.hybridService.retrieve("")
    expect(emptyResult.candidates).toEqual([])
    expect(emptyResult.diagnostics.lexicalCandidateCount).toBe(0)
    expect(emptyResult.diagnostics.vectorCandidateCount).toBe(0)

    const whitespaceResult = await ctx.hybridService.retrieve("   ")
    expect(whitespaceResult.candidates).toEqual([])
  })

  it("handles degraded mode when vector provider is unavailable", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "degraded.pdf")

    await ctx.chunkRepo.saveChunks(docId, [
      {
        id: "deg-chunk-1",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Urgent deadline on Monday morning.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    // Create an unavailable provider
    const unavailableProvider: EmbeddingProvider = {
      name: "UnavailableProvider",
      model: "test-model",
      dimensions: 1024,
      getMetadata: (): EmbeddingMetadata => ({
        model: "test-model",
        dimensions: 1024,
        version: "1.0",
        license: "test",
      }),
      embedChunks: async () => [],
      embedText: async () => {
        throw new Error("Local model weights not found")
      },
      isAvailable: async () => false,
    }

    const service = new HybridRetrievalService(
      ctx.ftsService,
      ctx.embeddingRepo,
      unavailableProvider
    )

    const result = await service.retrieve("deadline")

    // Must not crash, returns lexical results, marks degraded
    expect(result.diagnostics.isDegraded).toBe(true)
    expect(result.diagnostics.degradedReason).toBeDefined()
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0]?.chunkId).toBe("deg-chunk-1")
    expect(result.candidates[0]?.retrievalSources).toBe("lexical")
  })

  it("handles degraded mode when vector similarity search throws unexpectedly", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "failing.pdf")

    await ctx.chunkRepo.saveChunks(docId, [
      {
        id: "fail-chunk-1",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Tax payment confirmation voucher.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    // Provider says it's available, but embedText throws
    const throwingProvider: EmbeddingProvider = {
      name: "ThrowingProvider",
      model: "test-model",
      dimensions: 1024,
      getMetadata: (): EmbeddingMetadata => ({
        model: "test-model",
        dimensions: 1024,
        version: "1.0",
        license: "test",
      }),
      embedChunks: async () => [],
      embedText: async () => {
        throw new Error("ONNX runtime memory failure")
      },
      isAvailable: async () => true,
    }

    const service = new HybridRetrievalService(
      ctx.ftsService,
      ctx.embeddingRepo,
      throwingProvider
    )

    const result = await service.retrieve("Tax payment")

    expect(result.diagnostics.isDegraded).toBe(true)
    expect(result.diagnostics.degradedReason).toContain("Vector similarity search failed")
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0]?.chunkId).toBe("fail-chunk-1")
    expect(result.candidates[0]?.retrievalSources).toBe("lexical")
  })

  it("returns empty candidate list when no matches exist in either source", async () => {
    const result = await ctx.hybridService.retrieve("nonexistentterm123456789")
    expect(result.candidates).toHaveLength(0)
    expect(result.diagnostics.lexicalCandidateCount).toBe(0)
  })

  it("provides convenience search() method returning candidate list directly", async () => {
    const docId = await createTestDoc(ctx.documentRepo, "convenience.pdf")
    await ctx.chunkRepo.saveChunks(docId, [
      {
        id: "conv-1",
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Quick brown fox jumps over lazy dog.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    const candidates = await ctx.hybridService.search("fox jumps")
    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.chunkId).toBe("conv-1")
  })
})
