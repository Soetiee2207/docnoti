import type { HybridRetrievalCandidate } from "@/services/retrieval"
import type { DocumentPageInput } from "../types"
import type {
  BuiltContext,
  ContextBudgetConfig,
  ContextBudgetDiagnostics,
  DocumentContextGroup,
  DocumentPageContextGroup,
  SelectedContextChunk,
} from "./types"
import {
  CONSERVATIVE_CHARS_PER_TOKEN,
  DEFAULT_QA_TOKEN_BUDGET,
} from "./tokenBudget"

export const DEFAULT_MAX_TOKENS = DEFAULT_QA_TOKEN_BUDGET.contextBudget
export const DEFAULT_CHARS_PER_TOKEN = CONSERVATIVE_CHARS_PER_TOKEN
export const DEFAULT_MAX_CHUNKS = 25
export const DEFAULT_MAX_CHUNKS_PER_PAGE = 4

export class ContextBuilder {
  private defaultConfig: Required<ContextBudgetConfig>

  constructor(defaultConfig?: ContextBudgetConfig) {
    const charsPerToken = defaultConfig?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN
    const maxTokens = defaultConfig?.maxTokens ?? DEFAULT_MAX_TOKENS
    const maxCharacters = defaultConfig?.maxCharacters ?? Math.floor(maxTokens * charsPerToken)
    const maxChunks = defaultConfig?.maxChunks ?? DEFAULT_MAX_CHUNKS
    const maxChunksPerPage = defaultConfig?.maxChunksPerPage ?? DEFAULT_MAX_CHUNKS_PER_PAGE

    this.defaultConfig = {
      maxTokens,
      maxCharacters,
      charsPerToken,
      maxChunks,
      maxChunksPerPage,
    }
  }

  /**
   * Transforms raw hybrid retrieval candidates into bounded, evidence-grounded context.
   *
   * 1. Filters and deduplicates candidates by chunkId.
   * 2. Respects ranking order (higher fusedScore first).
   * 3. Promotes page diversity (caps chunks per single page on initial pass).
   * 4. Greedily selects whole chunks within the character/token budget (never slicing chunks to preserve provenance).
   * 5. Organizes selected chunks deterministically: document -> page (asc) -> chunkIndex (asc).
   * 6. Formats structured context with stable source identifiers: [docId/page/chunkId].
   */
  buildContext(
    candidates: HybridRetrievalCandidate[],
    budgetConfig?: ContextBudgetConfig,
    documentNames?: Record<string, string> | string
  ): BuiltContext {
    const charsPerToken = budgetConfig?.charsPerToken ?? this.defaultConfig.charsPerToken
    const maxChunks = budgetConfig?.maxChunks ?? this.defaultConfig.maxChunks
    const maxChunksPerPage = budgetConfig?.maxChunksPerPage ?? this.defaultConfig.maxChunksPerPage
    const effectiveMaxChars =
      budgetConfig?.maxCharacters ??
      (budgetConfig?.maxTokens !== undefined
        ? Math.floor(budgetConfig.maxTokens * charsPerToken)
        : this.defaultConfig.maxCharacters)

    if (!candidates || candidates.length === 0) {
      return this.createEmptyContext()
    }

    const seenChunkIds = new Set<string>()
    const selectedChunks: SelectedContextChunk[] = []
    const pageChunkCounts = new Map<string, number>()
    let currentChars = 0
    let truncatedDueToBudget = false

    const tryAddCandidate = (candidate: HybridRetrievalCandidate): boolean => {
      const contentLength = candidate.content.length
      // Extra overhead per chunk in formatted output (~80 chars for header tag)
      const estimatedChunkCost = contentLength + 80

      if (currentChars + estimatedChunkCost > effectiveMaxChars && selectedChunks.length > 0) {
        // Enforce hard limit: do NOT slice mid-chunk; preserve chunk/evidence integrity
        truncatedDueToBudget = true
        return false
      }

      seenChunkIds.add(candidate.chunkId)

      let docName: string | undefined
      if (typeof documentNames === "string") {
        docName = documentNames
      } else if (documentNames && documentNames[candidate.documentId]) {
        docName = documentNames[candidate.documentId]
      }

      selectedChunks.push({
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        documentName: docName,
        pageNumber: candidate.pageNumber,
        chunkIndex: candidate.chunkIndex,
        content: candidate.content,
        charStart: candidate.charStart,
        charEnd: candidate.charEnd,
        fusedScore: candidate.fusedScore,
        lexicalRank: candidate.lexicalRank,
        vectorRank: candidate.vectorRank,
        retrievalSources: candidate.retrievalSources,
      })

      currentChars += estimatedChunkCost

      const pageKey = `${candidate.documentId}:${candidate.pageNumber}`
      pageChunkCounts.set(pageKey, (pageChunkCounts.get(pageKey) ?? 0) + 1)
      return true
    }

    // Select ranked candidates respecting page diversity cap
    for (const candidate of candidates) {
      if (seenChunkIds.has(candidate.chunkId)) {
        continue
      }

      if (selectedChunks.length >= maxChunks) {
        truncatedDueToBudget = true
        break
      }

      const pageKey = `${candidate.documentId}:${candidate.pageNumber}`
      const currentPageCount = pageChunkCounts.get(pageKey) ?? 0

      if (currentPageCount >= maxChunksPerPage) {
        // Enforce page diversity cap
        continue
      }

      const added = tryAddCandidate(candidate)
      if (!added) {
        break
      }
    }

    // 2. Deterministic Organization: Group by document -> pageNumber (asc) -> chunkIndex (asc)
    const docMap = new Map<string, Map<number, SelectedContextChunk[]>>()

    for (const chunk of selectedChunks) {
      if (!docMap.has(chunk.documentId)) {
        docMap.set(chunk.documentId, new Map())
      }
      const pageMap = docMap.get(chunk.documentId)!
      if (!pageMap.has(chunk.pageNumber)) {
        pageMap.set(chunk.pageNumber, [])
      }
      pageMap.get(chunk.pageNumber)!.push(chunk)
    }

    const groups: DocumentContextGroup[] = []
    const formattedLines: string[] = []
    const pages: DocumentPageInput[] = []
    const pageContextMap = new Map<number, string>()
    const includedChunkIds = new Set<string>()

    for (const [docId, pageMap] of docMap.entries()) {
      const docName =
        typeof documentNames === "string"
          ? documentNames
          : documentNames?.[docId] ?? docId

      const sortedPageNumbers = Array.from(pageMap.keys()).sort((a, b) => a - b)
      const docPages: DocumentPageContextGroup[] = []

      formattedLines.push(`### DOCUMENT: ${docName} (ID: ${docId})`)

      for (const pageNum of sortedPageNumbers) {
        const chunks = pageMap.get(pageNum)!
        // Sort chunks on the same page by original chunkIndex
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)

        docPages.push({
          pageNumber: pageNum,
          chunks,
        })

        const pageChunkContents: string[] = []
        for (const c of chunks) {
          includedChunkIds.add(c.chunkId)
          pageChunkContents.push(c.content)

          // Formatted block with stable citation identifier [docId/page/chunkId]
          const offsetTag =
            c.charStart !== null && c.charEnd !== null
              ? ` [offsets: ${c.charStart}-${c.charEnd}]`
              : ""
          formattedLines.push(
            `[Source: ${docId}/page-${pageNum}/${c.chunkId}]${offsetTag}\n${c.content}`
          )
        }

        const combinedPageText = pageChunkContents.join("\n\n")
        pages.push({
          pageNumber: pageNum,
          text: combinedPageText,
        })

        // Track permitted source text for this page to enforce evidence validation
        const existingPageText = pageContextMap.get(pageNum)
        if (existingPageText) {
          pageContextMap.set(pageNum, `${existingPageText}\n\n${combinedPageText}`)
        } else {
          pageContextMap.set(pageNum, combinedPageText)
        }
      }

      groups.push({
        documentId: docId,
        documentName: docName,
        pages: docPages,
      })
    }

    const diagnostics: ContextBudgetDiagnostics = {
      totalCandidates: candidates.length,
      selectedChunksCount: selectedChunks.length,
      skippedChunksCount: candidates.length - selectedChunks.length,
      totalCharacters: currentChars,
      estimatedTokens: Math.ceil(currentChars / charsPerToken),
      budgetExceeded: candidates.length > selectedChunks.length,
      truncatedDueToBudget,
    }

    return {
      chunks: selectedChunks,
      groups,
      formattedText: formattedLines.join("\n\n"),
      pages,
      diagnostics,
      pageContextMap,
      includedChunkIds,
    }
  }

  private createEmptyContext(): BuiltContext {
    return {
      chunks: [],
      groups: [],
      formattedText: "",
      pages: [],
      diagnostics: {
        totalCandidates: 0,
        selectedChunksCount: 0,
        skippedChunksCount: 0,
        totalCharacters: 0,
        estimatedTokens: 0,
        budgetExceeded: false,
        truncatedDueToBudget: false,
      },
      pageContextMap: new Map(),
      includedChunkIds: new Set(),
    }
  }
}
