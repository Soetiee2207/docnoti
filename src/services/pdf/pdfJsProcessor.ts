import { pdfjsLib } from "./pdfjs"
import {
  type PDFProcessor,
  type PDFProcessingResult,
  type PDFPage,
  type PDFMetadata,
  PDFProcessingError,
} from "./types"

export interface PdfJsProcessorOptions {
  /**
   * Minimum non-whitespace characters on a page to consider it having sufficient text.
   * Default: 30 characters.
   */
  minCharsPerPage?: number
}

export class PdfJsProcessor implements PDFProcessor {
  private minCharsPerPage: number

  constructor(options: PdfJsProcessorOptions = {}) {
    this.minCharsPerPage = options.minCharsPerPage ?? 30
  }

  async process(fileData: Uint8Array): Promise<PDFProcessingResult> {
    if (!fileData || fileData.length === 0) {
      throw new PDFProcessingError("Dữ liệu tệp PDF rỗng.")
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: fileData.slice(0),
        useSystemFonts: true,
      })

      const pdfDoc = await loadingTask.promise
      const numPages = pdfDoc.numPages

      if (numPages === 0) {
        throw new PDFProcessingError("Tài liệu PDF không có trang nào.")
      }

      // Read document metadata
      let metadataInfo: Record<string, unknown> = {}
      try {
        const meta = await pdfDoc.getMetadata()
        if (meta && meta.info) {
          metadataInfo = meta.info as Record<string, unknown>
        }
      } catch {
        // Metadata reading error is non-fatal
      }

      const metadata: PDFMetadata = {
        title: typeof metadataInfo.Title === "string" ? metadataInfo.Title : undefined,
        author: typeof metadataInfo.Author === "string" ? metadataInfo.Author : undefined,
        creator: typeof metadataInfo.Creator === "string" ? metadataInfo.Creator : undefined,
        producer: typeof metadataInfo.Producer === "string" ? metadataInfo.Producer : undefined,
        creationDate: typeof metadataInfo.CreationDate === "string" ? metadataInfo.CreationDate : undefined,
        pageCount: numPages,
      }

      const pages: PDFPage[] = []
      let totalCharacters = 0

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const textContent = await page.getTextContent()

        const textFragments: string[] = []
        for (const item of textContent.items) {
          if ("str" in item && typeof item.str === "string") {
            textFragments.push(item.str)
          }
        }

        const pageText = textFragments.join(" ").replace(/\s+/g, " ").trim()
        const charCount = pageText.length
        totalCharacters += charCount

        const hasSufficientText = charCount >= this.minCharsPerPage

        pages.push({
          pageNumber: pageNum,
          text: pageText,
          charCount,
          hasSufficientText,
        })
      }

      // Document is considered to have sufficient text only if all pages meet the threshold
      const isSufficientText = pages.length > 0 && pages.every((p) => p.hasSufficientText)
      const needsOcr = !isSufficientText

      return {
        metadata,
        pages,
        totalCharacters,
        isSufficientText,
        needsOcr,
      }
    } catch (err) {
      if (err instanceof PDFProcessingError) {
        throw err
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new PDFProcessingError(`Lỗi khi giải mã tài liệu PDF: ${message}`, err)
    }
  }
}
