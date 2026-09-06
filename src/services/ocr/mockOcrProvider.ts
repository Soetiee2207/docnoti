import type { OCRProvider, OCRPageResult } from "./types"
import { OCRError } from "./types"

export interface MockOCROptions {
  available?: boolean
  customTextByPage?: Record<number, string>
  defaultText?: string
  simulateFailureOnPage?: number
  failureMessage?: string
}

export class MockOCRProvider implements OCRProvider {
  readonly name = "MockOCRProvider"
  private available: boolean
  private customTextByPage: Record<number, string>
  private defaultText: string
  private simulateFailureOnPage?: number
  private failureMessage: string

  constructor(options: MockOCROptions = {}) {
    this.available = options.available ?? true
    this.customTextByPage = options.customTextByPage ?? {}
    this.defaultText = options.defaultText ?? "Văn bản trích xuất từ OCR cục bộ (trang {page})"
    this.simulateFailureOnPage = options.simulateFailureOnPage
    this.failureMessage = options.failureMessage ?? "Giả lập lỗi nhận dạng OCR."
  }

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  async recognizePage(imageBytes: Uint8Array, pageNumber: number): Promise<OCRPageResult> {
    if (!this.available) {
      throw new OCRError("OCR engine không khả dụng trong môi trường hiện tại.")
    }

    if (this.simulateFailureOnPage === pageNumber) {
      throw new OCRError(this.failureMessage)
    }

    if (!imageBytes || imageBytes.length === 0) {
      throw new OCRError("Dữ liệu ảnh trang rỗng, không thể nhận dạng OCR.")
    }

    const text =
      this.customTextByPage[pageNumber] ??
      this.defaultText.replace("{page}", String(pageNumber))

    return {
      pageNumber,
      text,
      confidence: 0.95,
      lines: [
        {
          text,
          confidence: 0.95,
          box: { x: 10, y: 10, width: 200, height: 30 },
        },
      ],
    }
  }
}
