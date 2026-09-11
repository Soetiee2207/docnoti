import { useState, useEffect, useRef } from "react"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileImage,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DocumentPageRecord } from "@/db/schema"
import { pdfjsLib } from "@/services/pdf/pdfjs"
import { invoke } from "@tauri-apps/api/core"

interface DocumentViewerProps {
  pages: DocumentPageRecord[]
  currentPage: number
  onPageChange: (pageNumber: number) => void
  loading?: boolean
  storagePath?: string
}

export function DocumentViewer({
  pages,
  currentPage,
  onPageChange,
  loading = false,
  storagePath,
}: DocumentViewerProps) {
  const totalPages = pages.length
  const currentPageData = pages.find((p) => p.pageNumber === currentPage) ?? pages[0]

  // Presentation states
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf")
  const [zoomScale, setZoomScale] = useState<number>(1.2)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Load PDF document proxy via PDF.js if storagePath is provided
  useEffect(() => {
    let active = true
    if (!storagePath || typeof window === "undefined") {
      return
    }

    async function loadPdfDocument() {
      setLoadingPdf(true)
      setRenderError(null)
      try {
        let fileBytes: Uint8Array | null = null
        try {
          const bytes = await invoke<number[]>("read_stored_file", { storagePath })
          fileBytes = new Uint8Array(bytes)
        } catch {
          // In non-Tauri or test environment, fallback silently to text mode
          fileBytes = null
        }

        if (fileBytes && active) {
          const loadingTask = pdfjsLib.getDocument({ data: fileBytes })
          const doc = await loadingTask.promise
          if (active) {
            setPdfDoc(doc)
          }
        }
      } catch (err: any) {
        if (active) {
          console.warn("Unable to load PDF for canvas rendering:", err)
          setRenderError("Không thể tải bản in PDF, chuyển sang văn bản trích xuất.")
          setViewMode("text")
        }
      } finally {
        if (active) {
          setLoadingPdf(false)
        }
      }
    }

    void loadPdfDocument()
    return () => {
      active = false
    }
  }, [storagePath])

  // Render current page onto canvas
  useEffect(() => {
    let renderTask: any = null
    let active = true

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current || viewMode !== "pdf") return

      try {
        const safePageNum = Math.min(Math.max(1, currentPage), pdfDoc.numPages || totalPages)
        const page = await pdfDoc.getPage(safePageNum)
        if (!active) return

        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const viewport = page.getViewport({ scale: zoomScale })
        canvas.height = viewport.height
        canvas.width = viewport.width

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        })
        await renderTask.promise
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("PDF render error:", err)
        }
      }
    }

    void renderPage()
    return () => {
      active = false
      if (renderTask) {
        try {
          renderTask.cancel()
        } catch {
          // Ignore cancellation errors
        }
      }
    }
  }, [pdfDoc, currentPage, zoomScale, viewMode, totalPages])

  if (loading) {
    return (
      <div className="flex h-[620px] items-center justify-center rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary mr-2" />
        Đang tải trang tài liệu...
      </div>
    )
  }

  if (totalPages === 0) {
    return (
      <div className="flex h-[620px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
        <FileText className="mb-2 size-8 text-muted-foreground/60" />
        <p className="font-medium text-foreground">Chưa có văn bản được trích xuất</p>
        <p className="mt-1 max-w-xs text-[11px]">
          Tài liệu này chưa được xử lý trích xuất văn bản hoặc đang chờ OCR hoàn tất.
        </p>
      </div>
    )
  }

  const hasCanvasPdf = Boolean(pdfDoc && viewMode === "pdf")

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[580px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {/* Top Toolbar: Mode Switcher, Zoom, Page Navigator */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("pdf")}
              disabled={!pdfDoc}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                viewMode === "pdf" && pdfDoc
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-40"
              }`}
              title={pdfDoc ? "Xem trang in PDF" : "Đang tải hoặc không có bản in PDF"}
            >
              <FileImage className="size-3" />
              <span>Bản in PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("text")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                viewMode === "text" || !pdfDoc
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Xem văn bản trích xuất"
            >
              <FileText className="size-3" />
              <span>Văn bản trích xuất</span>
            </button>
          </div>

          <span className="text-[10px] text-muted-foreground font-mono ml-1 hidden sm:inline">
            {currentPageData?.charCount ?? 0} ký tự
          </span>
        </div>

        {/* Center: Zoom Controls (active in PDF mode) */}
        {hasCanvasPdf && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setZoomScale((z) => Math.max(0.6, parseFloat((z - 0.2).toFixed(1))))}
              title="Thu nhỏ"
              disabled={zoomScale <= 0.6}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="w-10 text-center text-[11px] font-mono tabular-nums text-muted-foreground">
              {Math.round(zoomScale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setZoomScale((z) => Math.min(2.5, parseFloat((z + 0.2).toFixed(1))))}
              title="Phóng to"
              disabled={zoomScale >= 2.5}
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setZoomScale(1.0)}
              title="Kích thước chuẩn (100%)"
            >
              <Maximize2 className="size-3" />
            </Button>
          </div>
        )}

        {/* Right: Page Navigation Switcher */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            title="Trang trước"
            className="cursor-pointer"
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <span className="px-1 text-xs font-semibold tabular-nums text-foreground select-none">
            {`Trang ${currentPage} / ${totalPages}`}
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            title="Trang sau"
            className="cursor-pointer"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Page Selector Strip (if multi-page) */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 px-3 py-1 text-[11px] shrink-0">
          <span className="text-muted-foreground text-[10px] mr-1 shrink-0 select-none">Chuyển trang:</span>
          {pages.map((p) => (
            <button
              key={p.pageNumber}
              type="button"
              onClick={() => onPageChange(p.pageNumber)}
              className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer text-[10px] ${
                p.pageNumber === currentPage
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60"
              }`}
            >
              {p.pageNumber}
            </button>
          ))}
        </div>
      )}

      {/* Viewer Main Body */}
      <div className="flex-1 overflow-auto bg-muted/15 p-4 flex flex-col items-center justify-start">
        {loadingPdf && (
          <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Đang tải bản in PDF...</span>
          </div>
        )}

        {/* PDF Canvas View */}
        {hasCanvasPdf && (
          <div className="flex justify-center w-full overflow-auto py-2">
            <canvas
              ref={canvasRef}
              className="rounded-lg shadow-md border border-border bg-white dark:bg-zinc-900 transition-transform duration-150"
            />
          </div>
        )}

        {/* Text View (displayed if in text mode or before canvas is loaded) */}
        {(!hasCanvasPdf || viewMode === "text") && !loadingPdf && (
          <div className="w-full max-w-3xl">
            {renderError && (
              <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400 italic">
                {renderError}
              </p>
            )}
            {currentPageData ? (
              <div className="whitespace-pre-wrap rounded-lg bg-card p-4 border border-border font-mono text-[11px] leading-relaxed text-foreground select-text shadow-2xs">
                {currentPageData.textContent}
              </div>
            ) : (
              <p className="text-muted-foreground italic text-xs">Không có nội dung cho trang này.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
