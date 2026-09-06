export class PDFProcessingError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "PDFProcessingError"
    this.cause = cause
  }
}

export interface PDFPage {
  /**
   * 1-indexed stable page number
   */
  pageNumber: number
  /**
   * Extracted text content from this page
   */
  text: string
  /**
   * Character count of non-whitespace or trimmed text
   */
  charCount: number
  /**
   * Whether this page contains sufficient text to skip OCR
   */
  hasSufficientText: boolean
}

export interface PDFMetadata {
  title?: string
  author?: string
  creator?: string
  producer?: string
  creationDate?: string
  pageCount: number
}

export interface PDFProcessingResult {
  metadata: PDFMetadata
  pages: PDFPage[]
  totalCharacters: number
  /**
   * True if document text extraction quality is deemed sufficient
   */
  isSufficientText: boolean
  /**
   * True if document requires OCR due to empty or insufficient text
   */
  needsOcr: boolean
}

export interface PDFProcessor {
  /**
   * Parse PDF from local binary data and extract text by page
   */
  process(fileData: Uint8Array): Promise<PDFProcessingResult>
}
