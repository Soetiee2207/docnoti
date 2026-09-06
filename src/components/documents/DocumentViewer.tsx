import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DocumentPageRecord } from "@/db/schema"

interface DocumentViewerProps {
  pages: DocumentPageRecord[]
  currentPage: number
  onPageChange: (pageNumber: number) => void
  loading?: boolean
}

export function DocumentViewer({
  pages,
  currentPage,
  onPageChange,
  loading = false,
}: DocumentViewerProps) {
  const totalPages = pages.length
  const currentPageData = pages.find((p) => p.pageNumber === currentPage) ?? pages[0]

  if (loading) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
        Đang tải trang tài liệu...
      </div>
    )
  }

  if (totalPages === 0) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
        <FileText className="mb-2 size-8 text-muted-foreground/60" />
        <p className="font-medium text-foreground">Chưa có văn bản được trích xuất</p>
        <p className="mt-1 max-w-xs text-[11px]">
          Tài liệu này chưa được xử lý trích xuất văn bản hoặc đang chờ OCR hoàn tất.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[620px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {/* Viewer Header & Page Navigation Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <FileText className="size-4 text-muted-foreground" />
          <span>Văn bản trích xuất</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground font-mono">
            {currentPageData?.charCount ?? 0} ký tự
          </span>
        </div>

        {/* Page Switcher */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            title="Trang trước"
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <span className="px-1 text-xs font-semibold tabular-nums text-foreground">
            {`Trang ${currentPage} / ${totalPages}`}
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            title="Trang sau"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Page Selector Strip (if multi-page) */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[11px]">
          <span className="text-muted-foreground text-[10px] mr-1 shrink-0">Chuyển trang:</span>
          {pages.map((p) => (
            <button
              key={p.pageNumber}
              type="button"
              onClick={() => onPageChange(p.pageNumber)}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                p.pageNumber === currentPage
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60"
              }`}
            >
              {p.pageNumber}
            </button>
          ))}
        </div>
      )}

      {/* Page Text Viewer */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-foreground select-text">
        {currentPageData ? (
          <div className="whitespace-pre-wrap rounded-lg bg-muted/20 p-3.5 border border-border/40">
            {currentPageData.textContent}
          </div>
        ) : (
          <p className="text-muted-foreground italic">Không có nội dung cho trang này.</p>
        )}
      </div>
    </div>
  )
}
