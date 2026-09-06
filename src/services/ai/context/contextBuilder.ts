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

export const DEFAULT_MAX_TOKENS = 3000
export const DEFAULT_CHARS_PER_TOKEN = 4
export const DEFAULT_MAX_CHUNKS = 20

export class ContextBuilder {
  private defaultConfig: Required<ContextBudgetConfig>

  constructor(defaultConfig?: ContextBudgetConfig) {
    const charsPerToken = defaultConfig?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN
    const maxTokens = defaultConfig?.maxTokens ?? DEFAULT_MAX_TOKENS
    const maxCharacters = defaultConfig?.maxCharacters ?? maxTokens * charsPerToken
    const maxChunks = defaultConfig?.maxChunks ?? DEFAULT_MAX_CHUNKS

    this.defaultConfig = {
      maxTokens,
      maxCharacters,
      charsPerToken,
      maxChunks,
    }
  }

  /**
   * Transforms raw hybrid retrieval candidates into bounded, evidence-grounded context.
   *
   * 1. Filters and deduplicates candidates by chunkId.
   * 2. Respects ranking order (higher fusedScore first).
   * 3. Greedily selects whole chunks within the character/token budget (never slicing chunks to preserve provenance).
   * 4. Organizes selected chunks deterministically: document -> page (asc) -> chunkIndex (asc).
   * 5. Formats structured context with stable source identifiers: [docId/page/chunkId].
   */
  buildContext(
    candidates: HybridRetrievalCandidate[],
    budgetConfig?: ContextBudgetConfig,
    documentNames?: Record<string, string> | string
  ): BuiltContext {
    const charsPerToken = budgetConfig?.charsPerToken ?? this.defaultConfig.charsPerToken
    const maxChunks = budgetConfig?.maxChunks ?? this.defaultConfig.maxChunks
    const effectiveMaxChars =
      budgetConfig?.maxCharacters ??
      (budgetConfig?.maxTokens !== undefined
        ? budgetConfig.maxTokens * charsPerToken
        : this.defaultConfig.maxCharacters)

    if (!candidates || candidates.length === 0) {
      return this.createEmptyContext()
    }

    const seenChunkIds = new Set<string>()
    const selectedChunks: SelectedContextChunk[] = []
    let currentChars = 0
    let truncatedDueToBudget = false

    // 1. Greedily select chunks in ranking order under budget
    for (const candidate of candidates) {
      if (seenChunkIds.has(candidate.chunkId)) {
        continue
      }

      if (selectedChunks.length >= maxChunks) {
        truncatedDueToBudget = true
        break
      }

      const contentLength = candidate.content.length
      // Estimate extra overhead per chunk in formatted output (~80 chars for header tag)
      const estimatedChunkCost = contentLength + 80

      if (currentChars + estimatedChunkCost > effectiveMaxChars && selectedChunks.length > 0) {
        // Stop before exceeding budget to avoid corrupting evidence boundaries
        truncatedDueToBudget = true
        break
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
