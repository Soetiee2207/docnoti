import { FileCheck, RefreshCw, Loader2, Layers, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./EvidenceBadge"
import type { AnalysisResult } from "@/services/ai"

interface DocumentFullSummaryViewProps {
  summary: AnalysisResult | null
  loading: boolean
  onGenerate: () => Promise<void>
  onNavigateToPage: (pageNumber: number) => void
}

export function DocumentFullSummaryView({
  summary,
  loading,
  onGenerate,
  onNavigateToPage,
}: DocumentFullSummaryViewProps) {
  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary mb-2" />
        <p className="font-medium text-foreground">Đang khởi tạo bản tóm tắt toàn bộ tài liệu...</p>
        <p className="mt-1 text-[11px]">Đang trích xuất loại tài liệu, trường dữ liệu chính và căn cứ xác thực.</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground space-y-3">
        <FileCheck className="size-8 text-muted-foreground/60" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Chưa có bản tóm tắt toàn diện</p>
          <p className="text-[11px] max-w-sm">
            Tài liệu này chưa có bản phân tích tổng quát. Bạn có thể yêu cầu AI phân loại và trích xuất toàn bộ dữ liệu quan trọng ngay bây giờ.
          </p>
        </div>
        <Button size="sm" onClick={onGenerate} className="gap-1.5 text-xs">
          <FileCheck className="size-3.5" />
          <span>Tạo tóm tắt tài liệu</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Overview & Classification Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Phân loại tài liệu:</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary uppercase text-[10px]">
              {summary.documentType}
            </span>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={onGenerate}
            disabled={loading}
            className="gap-1 text-[11px]"
            title="Chạy lại phân tích tổng thể tài liệu"
          >
            <RefreshCw className="size-3" />
            <span>Phân tích lại</span>
          </Button>
        </div>

        <div className="space-y-1">
          <h4 className="font-medium text-muted-foreground text-[11px]">Tóm tắt nội dung chính:</h4>
          <p className="leading-relaxed text-foreground select-text">{summary.summary}</p>
        </div>
      </div>

      {/* Extracted Fields Table */}
      {summary.fields && summary.fields.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2.5">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-muted-foreground" />
            Các trường dữ liệu được trích xuất
          </h4>
          <div className="divide-y divide-border/60">
            {summary.fields.map((field, idx) => (
              <div key={idx} className="py-2 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-medium text-foreground">{field.name}: </span>
                  <span className="text-muted-foreground">{String(field.value ?? "—")}</span>
                  {field.evidence?.citations?.[0] && (
                    <button
                      type="button"
                      onClick={() => onNavigateToPage(field.evidence.citations[0]!.pageNumber)}
                      className="ml-2 inline-flex items-center text-[10px] text-primary hover:underline cursor-pointer"
                    >
                      Trang {field.evidence.citations[0]!.pageNumber}
                    </button>
                  )}
                </div>
                <StatusBadge status={field.semanticStatus} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Evidences */}
      {summary.evidences && summary.evidences.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
            <Quote className="size-3.5 text-muted-foreground" />
            Bằng chứng trích dẫn ({summary.evidences.length})
          </h4>
          <div className="space-y-2">
            {summary.evidences.map((evidence, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-foreground select-text">{evidence.claim}</p>
                  <StatusBadge status={evidence.status} />
                </div>
                {evidence.citations && evidence.citations.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/40">
                    {evidence.citations.map((c, cIdx) => (
                      <div
                        key={cIdx}
                        className="rounded bg-muted/30 p-2 border border-border/40 text-[11px] space-y-1"
                      >
                        <button
                          type="button"
                          onClick={() => onNavigateToPage(c.pageNumber)}
                          className="font-semibold text-primary hover:underline cursor-pointer"
                        >
                          Trang {c.pageNumber}
                        </button>
                        {c.sourceText && (
                          <blockquote className="border-l-2 border-primary/40 pl-2 italic text-foreground/90 select-text">
                            "{c.sourceText}"
                          </blockquote>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
