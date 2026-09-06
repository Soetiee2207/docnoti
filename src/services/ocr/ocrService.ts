import type { OCRProvider, OCRPageResult, OCRResult } from "./types"
import type { PageRenderer } from "./pageRenderer"
import { OCRError } from "./types"
import type { DocumentPageRecord } from "@/db/schema"

export interface PageToProcess {
  pageNumber: number
  existingText?: string
  hasSufficientText: boolean
}

export class OCRService {
  private provider: OCRProvider
  private renderer: PageRenderer

  constructor(provider: OCRProvider, renderer: PageRenderer) {
    this.provider = provider
    this.renderer = renderer
  }

  getProviderName(): string {
    return this.provider.name
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable()
  }

  /**
   * Process a document's pages through OCR.
   * Only processes pages that have insufficient text (hasSufficientText === false / 0),
   * strictly preserving high-fidelity text extracted by PDF.js.
   */
  async processDocumentPages(
    documentId: string,
    pdfBytes: Uint8Array,
    existingPages: Array<Pick<DocumentPageRecord, "pageNumber" | "textContent" | "hasSufficientText">>
  ): Promise<OCRResult> {
    if (!pdfBytes || pdfBytes.length === 0) {
      throw new OCRError("Dữ liệu PDF rỗng, không thể thực hiện OCR.")
    }

    const available = await this.provider.isAvailable()
    if (!available) {
      throw new OCRError(
        `OCR Provider '${this.provider.name}' không khả dụng trong môi trường hiện tại.`
      )
    }

    const ocrPageResults: OCRPageResult[] = []

    for (const page of existingPages) {
      // Requirement 3: Do not overwrite text from PDF.js if text layer already has sufficient data
      if (page.hasSufficientText === 1 && page.textContent.trim().length >= 30) {
        ocrPageResults.push({
          pageNumber: page.pageNumber,
          text: page.textContent,
          confidence: 1.0,
        })
        continue
      }

      // Page requires OCR
      const imageBytes = await this.renderer.renderPageToImage(pdfBytes, page.pageNumber)
      const pageResult = await this.provider.recognizePage(imageBytes, page.pageNumber)

      ocrPageResults.push(pageResult)
    }

    const totalCharacters = ocrPageResults.reduce(
      (acc, p) => acc + (p.text ? p.text.length : 0),
      0
    )

    return {
      documentId,
      pages: ocrPageResults,
      totalCharacters,
      provider: this.provider.name,
    }
  }
}
