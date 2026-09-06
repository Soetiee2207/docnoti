import type { DocumentPageRecord, DocumentChunkRecord, NewDocumentChunkRecord } from "@/db/schema"
import type { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import type { DocumentPageRepository } from "@/repositories/documentPageRepository"
import type { ChunkInputPage, DocumentChunk, ChunkingOptions } from "./types"

interface TextSpan {
  text: string
  start: number
  end: number
}

const DEFAULT_MAX_CHUNK_CHARS = 1000
const DEFAULT_PARAGRAPH_SEPARATOR = /\r?\n\s*\r?\n+/

export class ChunkingService {
  private chunkRepo?: DocumentChunkRepository
  private pageRepo?: DocumentPageRepository
  private defaultOptions: Required<ChunkingOptions>

  constructor(
    chunkRepo?: DocumentChunkRepository,
    pageRepo?: DocumentPageRepository,
    options: ChunkingOptions = {}
  ) {
    this.chunkRepo = chunkRepo
    this.pageRepo = pageRepo
    this.defaultOptions = {
      maxChunkChars: options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS,
      paragraphSeparator: options.paragraphSeparator ?? DEFAULT_PARAGRAPH_SEPARATOR,
    }
  }

  /**
   * Splits text into non-empty paragraph spans with exact start and end offsets.
   */
  private findParagraphSpans(
    text: string,
    separator: RegExp | string
  ): TextSpan[] {
    const rawSpans: TextSpan[] = []

    if (typeof separator === "string") {
      let lastIndex = 0
      let matchIdx = text.indexOf(separator, lastIndex)
      while (matchIdx !== -1) {
        rawSpans.push({
          text: text.slice(lastIndex, matchIdx),
          start: lastIndex,
          end: matchIdx,
        })
        lastIndex = matchIdx + separator.length
        matchIdx = text.indexOf(separator, lastIndex)
      }
      rawSpans.push({
        text: text.slice(lastIndex),
        start: lastIndex,
        end: text.length,
      })
    } else {
      const flags = separator.flags.includes("g")
        ? separator.flags
        : separator.flags + "g"
      const regex = new RegExp(separator.source, flags)
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const matchStart = match.index
        const matchEnd = regex.lastIndex
        rawSpans.push({
          text: text.slice(lastIndex, matchStart),
          start: lastIndex,
          end: matchStart,
        })
        lastIndex = matchEnd
      }

      rawSpans.push({
        text: text.slice(lastIndex),
        start: lastIndex,
        end: text.length,
      })
    }

    const result: TextSpan[] = []
    for (const span of rawSpans) {
      const raw = span.text
      if (!raw || raw.trim().length === 0) {
        continue
      }

      const leadingMatch = raw.match(/^\s*/)
      const leading = leadingMatch ? leadingMatch[0].length : 0

      const trailingMatch = raw.match(/\s*$/)
      const trailing = trailingMatch ? trailingMatch[0].length : 0

      const trimmed = raw.slice(leading, raw.length - trailing)
      if (trimmed.length > 0) {
        result.push({
          text: trimmed,
          start: span.start + leading,
          end: span.end - trailing,
        })
      }
    }

    return result
  }

  /**
   * Deterministically splits a long paragraph text into bounded sub-chunks
   * without losing any content.
   */
  private splitLongParagraph(
    paraSpan: TextSpan,
    maxChars: number
  ): TextSpan[] {
    const text = paraSpan.text
    const baseOffset = paraSpan.start
    const subSpans: TextSpan[] = []
    let cursor = 0

    while (cursor < text.length) {
      // Skip leading whitespace at cursor
      while (cursor < text.length && /\s/.test(text[cursor])) {
        cursor++
      }

      if (cursor >= text.length) {
        break
      }

      const chunkStartRel = cursor
      const remaining = text.length - chunkStartRel

      if (remaining <= maxChars) {
        const content = text.slice(chunkStartRel)
        subSpans.push({
          text: content,
          start: baseOffset + chunkStartRel,
          end: baseOffset + text.length,
        })
        break
      }

      // We must pick a deterministic break index in (chunkStartRel, chunkStartRel + maxChars]
      const window = text.slice(chunkStartRel, chunkStartRel + maxChars)
      let breakRel = -1

      // 1. Prefer sentence boundaries: punctuation (. ! ?) followed by whitespace
      const sentenceRegex = /[.!?](\s+|$)/g
      let sMatch: RegExpExecArray | null
      let lastSentenceEnd = -1

      while ((sMatch = sentenceRegex.exec(window)) !== null) {
        // Break right after the punctuation mark
        lastSentenceEnd = sMatch.index + 1
      }

      if (lastSentenceEnd > 0 && lastSentenceEnd <= maxChars) {
        breakRel = chunkStartRel + lastSentenceEnd
      }

      // 2. If no sentence break, look for newline
      if (breakRel === -1) {
        const lastNewline = window.lastIndexOf("\n")
        if (lastNewline > 0) {
          breakRel = chunkStartRel + lastNewline
        }
      }

      // 3. If no newline, look for word boundary (space)
      if (breakRel === -1) {
        const lastSpace = window.search(/\s+(?=[^\s]*$)/)
        if (lastSpace > 0) {
          breakRel = chunkStartRel + lastSpace
        }
      }

      // 4. Hard character break if no punctuation or whitespace exists
      if (breakRel === -1) {
        breakRel = chunkStartRel + maxChars
      }

      const rawSub = text.slice(chunkStartRel, breakRel)
      const trailingMatch = rawSub.match(/\s*$/)
      const trailing = trailingMatch ? trailingMatch[0].length : 0
      const content = rawSub.slice(0, rawSub.length - trailing)

      subSpans.push({
        text: content,
        start: baseOffset + chunkStartRel,
        end: baseOffset + chunkStartRel + content.length,
      })

      cursor = breakRel
    }

    return subSpans
  }

  /**
   * Pure deterministic chunking function.
   * Transforms document pages into an ordered list of DocumentChunk items.
   *
   * Invariants preserved:
   * - A chunk strictly belongs to a single page (never spans multiple pages).
   * - chunkIndex is monotonically increasing (0, 1, 2, ...).
   * - charStart and charEnd directly map to:
   *   page.textContent.slice(chunk.charStart, chunk.charEnd) === chunk.content
   * - Output is deterministic across invocations.
   * - Empty pages produce zero chunks.
   */
  chunkDocument(
    documentId: string,
    pages: ChunkInputPage[],
    options?: ChunkingOptions
  ): DocumentChunk[] {
    const maxChars = options?.maxChunkChars ?? this.defaultOptions.maxChunkChars
    const separator =
      options?.paragraphSeparator ?? this.defaultOptions.paragraphSeparator

    // Ensure pages are sorted by pageNumber asc
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber)
    const chunks: DocumentChunk[] = []
    let chunkIndex = 0

    for (const page of sortedPages) {
      const pageText = page.textContent
      if (!pageText || pageText.trim().length === 0) {
        // Empty page produces no chunks
        continue
      }

      const paragraphSpans = this.findParagraphSpans(pageText, separator)

      for (const paraSpan of paragraphSpans) {
        if (paraSpan.text.length <= maxChars) {
          // Paragraph fits in a single chunk
          chunks.push({
            id: `${documentId}_c${chunkIndex}`,
            documentId,
            pageNumber: page.pageNumber,
            chunkIndex,
            content: paraSpan.text,
            charStart: paraSpan.start,
            charEnd: paraSpan.end,
          })
          chunkIndex++
        } else {
          // Paragraph exceeds maxChars: deterministically split into sub-chunks
          const subSpans = this.splitLongParagraph(paraSpan, maxChars)
          for (const sub of subSpans) {
            chunks.push({
              id: `${documentId}_c${chunkIndex}`,
              documentId,
              pageNumber: page.pageNumber,
              chunkIndex,
              content: sub.text,
              charStart: sub.start,
              charEnd: sub.end,
            })
            chunkIndex++
          }
        }
      }
    }

    return chunks
  }

  /**
   * End-to-end chunking and persistence:
   * 1. Fetches pages if not explicitly provided
   * 2. Runs deterministic chunkDocument
   * 3. Idempotently replaces document_chunks in SQLite
   * 4. Returns the persisted records
   */
  async chunkAndSave(
    documentId: string,
    pages?: DocumentPageRecord[],
    options?: ChunkingOptions
  ): Promise<DocumentChunkRecord[]> {
    if (!this.chunkRepo) {
      throw new Error("ChunkingService requires DocumentChunkRepository for chunkAndSave")
    }

    let inputPages: ChunkInputPage[]

    if (pages && pages.length > 0) {
      inputPages = pages
    } else {
      if (!this.pageRepo) {
        throw new Error("ChunkingService requires DocumentPageRepository to fetch pages")
      }
      inputPages = await this.pageRepo.findByDocumentId(documentId)
    }

    const generatedChunks = this.chunkDocument(documentId, inputPages, options)
    const now = new Date().toISOString()

    const records: NewDocumentChunkRecord[] = generatedChunks.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      content: c.content,
      charStart: c.charStart,
      charEnd: c.charEnd,
      createdAt: now,
      updatedAt: now,
    }))

    await this.chunkRepo.saveChunks(documentId, records)
    return this.chunkRepo.findByDocumentId(documentId)
  }

  /**
   * Retrieves all chunks for a document from the repository.
   */
  async getChunksByDocumentId(documentId: string): Promise<DocumentChunkRecord[]> {
    if (!this.chunkRepo) {
      throw new Error("ChunkingService requires DocumentChunkRepository")
    }
    return this.chunkRepo.findByDocumentId(documentId)
  }

  /**
   * Retrieves all chunks for a specific page from the repository.
   */
  async getChunksByPage(
    documentId: string,
    pageNumber: number
  ): Promise<DocumentChunkRecord[]> {
    if (!this.chunkRepo) {
      throw new Error("ChunkingService requires DocumentChunkRepository")
    }
    return this.chunkRepo.findByPage(documentId, pageNumber)
  }
}
