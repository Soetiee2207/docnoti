export class OCRError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "OCRError"
    this.cause = cause
  }
}

export interface OCRBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OCRLine {
  text: string
  confidence?: number
  box?: OCRBoundingBox
}

export interface OCRPageResult {
  pageNumber: number
  text: string
  confidence?: number
  lines?: OCRLine[]
}

export interface OCRResult {
  documentId: string
  pages: OCRPageResult[]
  totalCharacters: number
  provider: string
}

export interface OCRProvider {
  readonly name: string

  /**
   * Check if the OCR engine/runtime is available in the local environment
   */
  isAvailable(): Promise<boolean>

  /**
   * Recognize text on a single rendered page image
   */
  recognizePage(imageBytes: Uint8Array, pageNumber: number): Promise<OCRPageResult>
}
