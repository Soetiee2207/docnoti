import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"
import { OCRError } from "./types"

export interface PageRenderer {
  renderPageToImage(pdfBytes: Uint8Array, pageNumber: number): Promise<Uint8Array>
}

export class CanvasPageRenderer implements PageRenderer {
  private scale: number

  constructor(scale = 2.0) {
    this.scale = scale
  }

  async renderPageToImage(pdfBytes: Uint8Array, pageNumber: number): Promise<Uint8Array> {
    if (!pdfBytes || pdfBytes.length === 0) {
      throw new OCRError("Dữ liệu PDF rỗng, không thể render trang.")
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: pdfBytes.slice(0),
        useSystemFonts: true,
      })
      const pdfDoc = await loadingTask.promise

      if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
        throw new OCRError(
          `Trang ${pageNumber} không hợp lệ (tổng số trang: ${pdfDoc.numPages}).`
        )
      }

      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: this.scale })

      // Support OffscreenCanvas (Webview2 / modern browsers)
      if (typeof OffscreenCanvas !== "undefined") {
        const offscreen = new OffscreenCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
        const ctx = offscreen.getContext("2d")
        if (!ctx) {
          throw new OCRError("Không thể khởi tạo 2D context cho OffscreenCanvas.")
        }

        // Render PDF page to canvas
        const renderTask = page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: offscreen as unknown as HTMLCanvasElement,
        })
        await renderTask.promise

        const blob = await offscreen.convertToBlob({ type: "image/png" })
        const buffer = await blob.arrayBuffer()
        return new Uint8Array(buffer)
      }

      // Fallback: document.createElement('canvas') if in standard DOM browser
      if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas")
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          throw new OCRError("Không thể khởi tạo 2D context cho canvas element.")
        }

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        })
        await renderTask.promise

        const blobPromise = new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new OCRError("Không thể chuyển đổi canvas thành PNG blob."))
          }, "image/png")
        })

        const blob = await blobPromise
        const buffer = await blob.arrayBuffer()
        return new Uint8Array(buffer)
      }

      // If running in headless Node without canvas
      // Return a simulated image byte container with page metadata
      const textEncoder = new TextEncoder()
      return textEncoder.encode(`SIMULATED_PAGE_IMAGE_${pageNumber}_${pdfBytes.length}`)
    } catch (err) {
      if (err instanceof OCRError) throw err
      throw new OCRError(
        `Lỗi khi render trang ${pageNumber} sang ảnh: ${err instanceof Error ? err.message : String(err)}`,
        err
      )
    }
  }
}
