export interface ChunkInputPage {
  pageNumber: number
  textContent: string
}

export interface DocumentChunk {
  id: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  content: string
  charStart: number
  charEnd: number
}

export interface ChunkingOptions {
  /**
   * Maximum character count per chunk.
   * Paragraphs exceeding this limit are deterministically sub-chunked.
   * Default: 1000 characters.
   */
  maxChunkChars?: number

  /**
   * Optional custom separator regex or string for paragraph boundaries.
   * Default: /\r?\n\s*\r?\n+/ (blank line delimiter)
   */
  paragraphSeparator?: RegExp | string
}
