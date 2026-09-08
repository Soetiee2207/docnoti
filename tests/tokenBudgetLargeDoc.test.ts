import { describe, it, expect, vi } from "vitest"
import {
  ContextBuilder,
  estimateTokenCount,
  DEFAULT_QA_TOKEN_BUDGET,
  DEFAULT_SUMMARY_TOKEN_BUDGET,
} from "@/services/ai/context"
import { AnalysisService } from "@/services/ai/analysisService"
import { OpenAIProvider } from "@/services/ai/openAiProvider"
import { AIError, type AnalysisRequest, type AnalysisResult } from "@/services/ai/types"
import type { HybridRetrievalCandidate } from "@/services/retrieval"
import type { DocumentRecord, DocumentPageRecord } from "@/db/schema"
import type { SecretsService } from "@/services/secrets"

describe("Token Budget & Large Document Regression Tests (219 Pages)", () => {
  describe("Phase 3 — Conservative Token Estimator & Approximation", () => {
    it("conservatively estimates tokens for Vietnamese text", () => {
      // 28 characters -> 28 / 2.8 = 10 tokens
      const text = "Lịch sử Đảng Cộng sản VN 2026"
      const tokens = estimateTokenCount(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBe(Math.ceil(text.length / 2.8))
    })

    it("reserves distinct budget partitions for QA and Summary", () => {
      // QA Budget
      expect(DEFAULT_QA_TOKEN_BUDGET.contextBudget).toBeLessThanOrEqual(12000)
      expect(DEFAULT_QA_TOKEN_BUDGET.contextBudget).toBe(6500)
      expect(
        DEFAULT_QA_TOKEN_BUDGET.contextBudget +
          DEFAULT_QA_TOKEN_BUDGET.outputReserve +
          DEFAULT_QA_TOKEN_BUDGET.systemPromptReserve +
          DEFAULT_QA_TOKEN_BUDGET.queryReserve
      ).toBe(DEFAULT_QA_TOKEN_BUDGET.totalLimit)

      // Summary Budget
      expect(DEFAULT_SUMMARY_TOKEN_BUDGET.contextBudget).toBe(8000)
      expect(
        DEFAULT_SUMMARY_TOKEN_BUDGET.contextBudget +
          DEFAULT_SUMMARY_TOKEN_BUDGET.outputReserve +
          DEFAULT_SUMMARY_TOKEN_BUDGET.systemPromptReserve +
          DEFAULT_SUMMARY_TOKEN_BUDGET.queryReserve
      ).toBe(DEFAULT_SUMMARY_TOKEN_BUDGET.totalLimit)
    })
  })

  describe("Phase 2 — ContextBuilder Hard Limit & Diversity on 219 Pages", () => {
    it("strictly bounds retrieval context within configured QA budget and never slices chunks", () => {
      const builder = new ContextBuilder()
      // Simulate 60 candidates retrieved across a 219-page document
      const candidates: HybridRetrievalCandidate[] = Array.from({ length: 60 }, (_, i) => ({
        chunkId: `chunk-${i}`,
        documentId: "doc-219-pages",
        pageNumber: (i % 219) + 1,
        chunkIndex: Math.floor(i / 219),
        content: `Nội dung trích đoạn nghiên cứu lịch sử trang ${(i % 219) + 1} với chi tiết sự kiện ${i}. `.repeat(15),
        charStart: 0,
        charEnd: 1000,
        fusedScore: 1 / (60 + i),
        lexicalRank: i,
        vectorRank: i,
        retrievalSources: "both",
      }))

      const context = builder.buildContext(candidates)

      // ContextBuilder must strictly enforce budget
      expect(context.diagnostics.estimatedTokens).toBeLessThanOrEqual(
        DEFAULT_QA_TOKEN_BUDGET.contextBudget
      )
      expect(context.diagnostics.totalCharacters).toBeLessThanOrEqual(
        DEFAULT_QA_TOKEN_BUDGET.maxContextCharacters
      )
      expect(context.chunks.length).toBeGreaterThan(0)
      expect(context.chunks.length).toBeLessThan(candidates.length)
      expect(context.diagnostics.truncatedDueToBudget).toBe(true)

      // Verify every chunk is intact (never sliced in the middle)
      for (const chunk of context.chunks) {
        expect(chunk.content.endsWith(". ")).toBe(true)
      }
    })

    it("promotes page diversity instead of letting a single page monopolize all chunks", () => {
      const builder = new ContextBuilder({ maxChunksPerPage: 2, maxChunks: 10 })
      // 10 candidates from page 1, and 5 candidates from other pages
      const candidates: HybridRetrievalCandidate[] = [
        ...Array.from({ length: 10 }, (_, i) => ({
          chunkId: `p1-chunk-${i}`,
          documentId: "doc-219-pages",
          pageNumber: 1,
          chunkIndex: i,
          content: `Trang 1 nội dung phần ${i}`,
          charStart: i * 100,
          charEnd: (i + 1) * 100,
          fusedScore: 0.9 - i * 0.01,
          lexicalRank: i,
          vectorRank: i,
          retrievalSources: "both" as const,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          chunkId: `other-page-chunk-${i}`,
          documentId: "doc-219-pages",
          pageNumber: 50 + i * 20,
          chunkIndex: 0,
          content: `Trang ${50 + i * 20} nội dung chương khác`,
          charStart: 0,
          charEnd: 100,
          fusedScore: 0.7 - i * 0.01,
          lexicalRank: 10 + i,
          vectorRank: 10 + i,
          retrievalSources: "both" as const,
        })),
      ]

      const context = builder.buildContext(candidates)

      // Count chunks selected from page 1
      const p1Selected = context.chunks.filter((c) => c.pageNumber === 1)
      const otherSelected = context.chunks.filter((c) => c.pageNumber !== 1)

      expect(p1Selected.length).toBeLessThanOrEqual(2)
      expect(otherSelected.length).toBeGreaterThan(0)
    })
  })

  describe("Phase 4 — Full Summary on 219 Pages vs Q&A", () => {
    it("budgets 219 pages into representative window without sending 200k+ tokens", () => {
      const mockAiProvider = {
        id: "mock",
        metadata: { providerId: "mock", modelId: "mock-model", displayName: "Mock", isLocal: true },
        isAvailable: vi.fn().mockResolvedValue({ available: true }),
        analyze: vi.fn().mockImplementation(async (req: AnalysisRequest) => {
          return {
            documentId: req.documentId,
            documentType: "REPORT" as const,
            summary: "Bản tóm tắt tổng quan từ các phần trọng tâm.",
            confidence: "VERIFIED" as const,
            fields: [],
            evidences: [
              {
                claim: "Nội dung mở đầu",
                status: "VERIFIED" as const,
                confidence: 0.95,
                citations: [{ pageNumber: 1, sourceText: req.pages[0]?.text.slice(0, 30) ?? "" }],
              },
            ],
            warnings: [],
            provider: "mock",
            model: "mock-model",
            analyzedAt: new Date().toISOString(),
          } satisfies AnalysisResult
        }),
      }

      // Generate 219 pages simulating ~600,000 characters
      const simulated219Pages: DocumentPageRecord[] = Array.from({ length: 219 }, (_, i) => ({
        id: `page-${i + 1}`,
        documentId: "doc-219-pages",
        pageNumber: i + 1,
        textContent: `Văn bản giáo trình Lịch sử Đảng Cộng sản Việt Nam trang ${i + 1}. `.repeat(50), // ~3,300 chars/page
        pageHash: `hash-${i + 1}`,
        ocrApplied: 0,
        createdAt: new Date().toISOString(),
      }))

      const totalRawChars = simulated219Pages.reduce((acc, p) => acc + p.textContent.length, 0)
      expect(totalRawChars).toBeGreaterThan(600000) // ~600k+ chars, identical to real document

      const analysisService = new AnalysisService({
        aiProvider: mockAiProvider,
        documentRepo: {
          findById: vi.fn().mockResolvedValue({
            id: "doc-219-pages",
            name: "gt-lich-su-dang-csvn-ban-tuyen-giao-tw.pdf",
            mimeType: "application/pdf",
          } as DocumentRecord),
        } as any,
        pageRepo: {
          findByDocumentId: vi.fn().mockResolvedValue(simulated219Pages),
        } as any,
      })

      // Run prepareBudgetedSummaryPages
      const { selectedPages, isSampled, totalOriginalChars } =
        analysisService.prepareBudgetedSummaryPages(simulated219Pages)

      expect(isSampled).toBe(true)
      expect(totalOriginalChars).toBe(totalRawChars)
      expect(selectedPages.length).toBeLessThan(simulated219Pages.length)

      const selectedChars = selectedPages.reduce((acc, p) => acc + p.textContent.length, 0)
      expect(selectedChars).toBeLessThanOrEqual(DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters)

      const estimatedTokens = estimateTokenCount(
        selectedPages.map((p) => p.textContent).join("\n")
      )
      // Assertion: estimated input tokens must be within configured summary budget
      expect(estimatedTokens).toBeLessThanOrEqual(DEFAULT_SUMMARY_TOKEN_BUDGET.contextBudget)
    })

    it("annotates LARGE_DOCUMENT_SAMPLED warning when analyzing a 219-page document in full summary mode", async () => {
      const mockAiProvider = {
        id: "mock",
        metadata: { providerId: "mock", modelId: "mock-model", displayName: "Mock", isLocal: true },
        isAvailable: vi.fn().mockResolvedValue({ available: true }),
        analyze: vi.fn().mockImplementation(async (req: AnalysisRequest) => {
          // Verify that the request sent to AI provider NEVER includes all 219 pages
          expect(req.pages.length).toBeLessThan(219)

          const totalReqChars = req.pages.reduce((acc, p) => acc + p.text.length, 0)
          expect(totalReqChars).toBeLessThanOrEqual(DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters)

          return {
            documentId: req.documentId,
            documentType: "REPORT" as const,
            summary: "Bản tóm tắt giáo trình lịch sử.",
            confidence: "VERIFIED" as const,
            fields: [],
            evidences: [],
            warnings: [],
            provider: "mock",
            model: "mock-model",
            analyzedAt: new Date().toISOString(),
          } satisfies AnalysisResult
        }),
      }

      const simulated219Pages: DocumentPageRecord[] = Array.from({ length: 219 }, (_, i) => ({
        id: `page-${i + 1}`,
        documentId: "doc-219-pages",
        pageNumber: i + 1,
        textContent: `Văn bản giáo trình Lịch sử Đảng trang ${i + 1}. `.repeat(40),
        pageHash: `hash-${i + 1}`,
        ocrApplied: 0,
        createdAt: new Date().toISOString(),
      }))

      const analysisService = new AnalysisService({
        aiProvider: mockAiProvider,
        documentRepo: {
          findById: vi.fn().mockResolvedValue({
            id: "doc-219-pages",
            name: "gt-lich-su-dang-csvn-ban-tuyen-giao-tw.pdf",
            mimeType: "application/pdf",
          } as DocumentRecord),
        } as any,
        pageRepo: {
          findByDocumentId: vi.fn().mockResolvedValue(simulated219Pages),
        } as any,
      })

      const { result } = await analysisService.analyzeDocument("doc-219-pages")

      // Result must include LARGE_DOCUMENT_SAMPLED warning
      const sampleWarning = result.warnings.find((w) => w.code === "LARGE_DOCUMENT_SAMPLED")
      expect(sampleWarning).toBeDefined()
      expect(sampleWarning?.message).toContain("219 trang")
    })
  })

  describe("Phase 5 — Error Handling & Guardrails in OpenAIProvider", () => {
    it("halts oversized request locally without sending to OpenAI and returns clear message", async () => {
      const mockSecretsService: SecretsService = {
        getSecret: vi.fn().mockResolvedValue("sk-valid-test-key"),
        setSecret: vi.fn().mockResolvedValue(),
        deleteSecret: vi.fn().mockResolvedValue(),
        hasSecret: vi.fn().mockResolvedValue(true),
      }

      const mockFetch = vi.fn()
      const provider = new OpenAIProvider(mockSecretsService, {
        fetchFn: mockFetch as any,
      })

      // Construct an intentionally oversized request (> 15,000 prompt tokens ~ 45,000+ chars)
      const oversizedRequest: AnalysisRequest = {
        documentId: "oversized-doc",
        fileName: "oversized.pdf",
        mimeType: "application/pdf",
        pages: Array.from({ length: 50 }, (_, i) => ({
          pageNumber: i + 1,
          text: "Đoạn văn bản quá khổ vượt quá ngân sách kiểm tra cục bộ. ".repeat(30), // ~1,800 chars * 50 = ~90,000 chars (> 30k tokens)
        })),
      }

      await expect(provider.analyze(oversizedRequest)).rejects.toThrow(
        "Ngữ cảnh tài liệu quá lớn. Hệ thống đã tự động thu gọn các đoạn liên quan."
      )

      // Crucial: fetch was NEVER called; request was blocked locally
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("does NOT retry 429 when error text indicates TPM token limit violation", async () => {
      const mockSecretsService: SecretsService = {
        getSecret: vi.fn().mockResolvedValue("sk-valid-test-key"),
        setSecret: vi.fn().mockResolvedValue(),
        deleteSecret: vi.fn().mockResolvedValue(),
        hasSecret: vi.fn().mockResolvedValue(true),
      }

      // Return 429 rate limit with TPM limit message (identical to real runtime error)
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              message: "Rate limit reached for model `gpt-4o-mini` in organization on tokens per min (TPM): Limit 200000, Requested: 206911.",
              type: "tokens",
              param: null,
              code: "rate_limit_exceeded",
            },
          })
        ),
      })

      const provider = new OpenAIProvider(mockSecretsService, {
        fetchFn: mockFetch as any,
        maxRetries: 2,
      })

      const request: AnalysisRequest = {
        documentId: "test-doc",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        pages: [{ pageNumber: 1, text: "Normal test text" }],
      }

      try {
        await provider.analyze(request)
        expect.unreachable("Should have thrown AIError")
      } catch (err) {
        expect(err).toBeInstanceOf(AIError)
        const aiErr = err as AIError
        expect(aiErr.code).toBe("RATE_LIMIT")
        // Crucial: retryable must be FALSE so provider does NOT retry oversized payload
        expect(aiErr.retryable).toBe(false)
      }

      // Attempted only ONCE (no retries because retryable is false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
