import { describe, it, expect } from "vitest"
import {
  ContextBuilder,
  type ContextBudgetConfig,
} from "@/services/ai/context"
import type { HybridRetrievalCandidate } from "@/services/retrieval"

function makeCandidate(
  overrides: Partial<HybridRetrievalCandidate> = {}
): HybridRetrievalCandidate {
  return {
    chunkId: "c-1",
    documentId: "doc-1",
    pageNumber: 1,
    chunkIndex: 0,
    content: "Sample chunk content for testing purposes.",
    charStart: 0,
    charEnd: 42,
    fusedScore: 0.03,
    lexicalRank: 1,
    lexicalScore: -5.0,
    vectorRank: 1,
    vectorScore: 0.88,
    retrievalSources: "both",
    ...overrides,
  }
}

describe("ContextBuilder - Unit Tests", () => {
  it("handles empty candidate pool gracefully", () => {
    const builder = new ContextBuilder()
    const context = builder.buildContext([])

    expect(context.chunks).toEqual([])
    expect(context.groups).toEqual([])
    expect(context.formattedText).toBe("")
    expect(context.pages).toEqual([])
    expect(context.pageContextMap.size).toBe(0)
    expect(context.includedChunkIds.size).toBe(0)
    expect(context.diagnostics.totalCandidates).toBe(0)
    expect(context.diagnostics.selectedChunksCount).toBe(0)
    expect(context.diagnostics.truncatedDueToBudget).toBe(false)
  })

  it("selects candidates in ranking order (highest fusedScore first)", () => {
    const builder = new ContextBuilder()
    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({ chunkId: "c-low", fusedScore: 0.01, content: "Low score" }),
      makeCandidate({ chunkId: "c-high", fusedScore: 0.05, content: "High score" }),
      makeCandidate({ chunkId: "c-mid", fusedScore: 0.03, content: "Mid score" }),
    ]

    // Note: Candidates are passed in order as returned by retrieval (sorted high to low)
    const sortedCandidates = [...candidates].sort((a, b) => b.fusedScore - a.fusedScore)
    const context = builder.buildContext(sortedCandidates)

    expect(context.chunks).toHaveLength(3)
    expect(context.chunks[0]?.chunkId).toBe("c-high")
    expect(context.chunks[1]?.chunkId).toBe("c-mid")
    expect(context.chunks[2]?.chunkId).toBe("c-low")
  })

  it("deduplicates candidates with identical chunkId", () => {
    const builder = new ContextBuilder()
    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({ chunkId: "c-dup", fusedScore: 0.05, content: "First instance" }),
      makeCandidate({ chunkId: "c-dup", fusedScore: 0.02, content: "Second instance" }),
      makeCandidate({ chunkId: "c-unique", fusedScore: 0.03, content: "Unique chunk" }),
    ]

    const context = builder.buildContext(candidates)

    expect(context.chunks).toHaveLength(2)
    expect(context.chunks.map((c) => c.chunkId)).toEqual(["c-dup", "c-unique"])
    expect(context.diagnostics.selectedChunksCount).toBe(2)
  })

  it("organizes context deterministically by pageNumber and chunkIndex", () => {
    const builder = new ContextBuilder()
    // Suppose retrieval ranked chunk on page 3 first, then page 1 chunk 1, then page 1 chunk 0
    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({
        chunkId: "c-p3",
        pageNumber: 3,
        chunkIndex: 0,
        content: "Page 3 Content",
        fusedScore: 0.09,
      }),
      makeCandidate({
        chunkId: "c-p1-idx1",
        pageNumber: 1,
        chunkIndex: 1,
        content: "Page 1 Chunk 1 Content",
        fusedScore: 0.08,
      }),
      makeCandidate({
        chunkId: "c-p1-idx0",
        pageNumber: 1,
        chunkIndex: 0,
        content: "Page 1 Chunk 0 Content",
        fusedScore: 0.07,
      }),
    ]

    const context = builder.buildContext(candidates)

    // Selection order preserves rank
    expect(context.chunks[0]?.chunkId).toBe("c-p3")
    expect(context.chunks[1]?.chunkId).toBe("c-p1-idx1")
    expect(context.chunks[2]?.chunkId).toBe("c-p1-idx0")

    // Group organization: page 1 first, then page 3; on page 1, chunk 0 before chunk 1
    expect(context.groups).toHaveLength(1)
    const docGroup = context.groups[0]!
    expect(docGroup.pages).toHaveLength(2)
    expect(docGroup.pages[0]?.pageNumber).toBe(1)
    expect(docGroup.pages[1]?.pageNumber).toBe(3)

    // Verify chunk order on Page 1
    const p1Chunks = docGroup.pages[0]?.chunks ?? []
    expect(p1Chunks[0]?.chunkId).toBe("c-p1-idx0")
    expect(p1Chunks[1]?.chunkId).toBe("c-p1-idx1")

    // Verify bounded pages output for AnalysisRequest
    expect(context.pages).toHaveLength(2)
    expect(context.pages[0]?.pageNumber).toBe(1)
    expect(context.pages[0]?.text).toBe(
      "Page 1 Chunk 0 Content\n\nPage 1 Chunk 1 Content"
    )
    expect(context.pages[1]?.pageNumber).toBe(3)
    expect(context.pages[1]?.text).toBe("Page 3 Content")
  })

  it("handles multiple documents cleanly", () => {
    const builder = new ContextBuilder()
    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({
        chunkId: "c-docA-1",
        documentId: "doc-A",
        pageNumber: 1,
        chunkIndex: 0,
        content: "Doc A content",
      }),
      makeCandidate({
        chunkId: "c-docB-1",
        documentId: "doc-B",
        pageNumber: 1,
        chunkIndex: 0,
        content: "Doc B content",
      }),
    ]

    const context = builder.buildContext(candidates, undefined, {
      "doc-A": "Contract.pdf",
      "doc-B": "Invoice.pdf",
    })

    expect(context.groups).toHaveLength(2)
    expect(context.groups[0]?.documentName).toBe("Contract.pdf")
    expect(context.groups[1]?.documentName).toBe("Invoice.pdf")
    expect(context.formattedText).toContain("DOCUMENT: Contract.pdf")
    expect(context.formattedText).toContain("DOCUMENT: Invoice.pdf")
  })

  it("strictly preserves provenance and character offsets", () => {
    const builder = new ContextBuilder()
    const candidate = makeCandidate({
      chunkId: "chunk-prov",
      documentId: "doc-prov",
      pageNumber: 4,
      chunkIndex: 2,
      content: "Strict provenance text block.",
      charStart: 250,
      charEnd: 279,
      retrievalSources: "both",
    })

    const context = builder.buildContext([candidate])
    const selected = context.chunks[0]!

    expect(selected.chunkId).toBe("chunk-prov")
    expect(selected.documentId).toBe("doc-prov")
    expect(selected.pageNumber).toBe(4)
    expect(selected.chunkIndex).toBe(2)
    expect(selected.content).toBe("Strict provenance text block.")
    expect(selected.charStart).toBe(250)
    expect(selected.charEnd).toBe(279)
    expect(selected.retrievalSources).toBe("both")

    // Formatted text should include stable citation identifier
    expect(context.formattedText).toContain(
      "[Source: doc-prov/page-4/chunk-prov] [offsets: 250-279]"
    )
  })

  it("enforces context budget and never corrupts chunk boundaries with partial slicing", () => {
    const builder = new ContextBuilder()
    const chunkContent = "A".repeat(200) // 200 chars

    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({ chunkId: "c-1", content: chunkContent, fusedScore: 0.1 }),
      makeCandidate({ chunkId: "c-2", content: chunkContent, fusedScore: 0.09 }),
      makeCandidate({ chunkId: "c-3", content: chunkContent, fusedScore: 0.08 }),
    ]

    // Configure a strict character budget allowing ~1-2 chunks only (each chunk is 200 + 80 overhead = 280)
    const budget: ContextBudgetConfig = {
      maxCharacters: 500,
    }

    const context = builder.buildContext(candidates, budget)

    // Must include 1 chunk (280 <= 500), but adding chunk 2 would be 560 > 500 so stops before exceeding
    expect(context.chunks).toHaveLength(1)
    expect(context.chunks[0]?.chunkId).toBe("c-1")
    // Crucial: whole chunk content preserved, NOT sliced to 500 chars
    expect(context.chunks[0]?.content).toHaveLength(200)
    expect(context.diagnostics.truncatedDueToBudget).toBe(true)
    expect(context.diagnostics.skippedChunksCount).toBe(2)
  })

  it("enforces maxChunks limit", () => {
    const builder = new ContextBuilder()
    const candidates: HybridRetrievalCandidate[] = Array.from(
      { length: 10 },
      (_, i) =>
        makeCandidate({
          chunkId: `c-${i}`,
          content: `Chunk ${i}`,
          fusedScore: 1 / (60 + i + 1),
        })
    )

    const context = builder.buildContext(candidates, { maxChunks: 3 })
    expect(context.chunks).toHaveLength(3)
    expect(context.diagnostics.selectedChunksCount).toBe(3)
    expect(context.diagnostics.skippedChunksCount).toBe(7)
    expect(context.diagnostics.truncatedDueToBudget).toBe(true)
  })

  it("populates pageContextMap for evidence validation lookup", () => {
    const builder = new ContextBuilder()
    const candidates: HybridRetrievalCandidate[] = [
      makeCandidate({
        chunkId: "c-1",
        pageNumber: 2,
        content: "Payment due date: March 15, 2026.",
      }),
      makeCandidate({
        chunkId: "c-2",
        pageNumber: 2,
        content: "Account balance: $500.",
      }),
    ]

    const context = builder.buildContext(candidates)
    expect(context.pageContextMap.has(2)).toBe(true)
    expect(context.pageContextMap.has(1)).toBe(false)

    const textP2 = context.pageContextMap.get(2)!
    expect(textP2).toContain("Payment due date: March 15, 2026.")
    expect(textP2).toContain("Account balance: $500.")
  })
})
