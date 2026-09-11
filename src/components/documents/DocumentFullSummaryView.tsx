import { FileCheck, RefreshCw, Loader2, Layers, Quote, AlertTriangle, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./EvidenceBadge"
import type { AnalysisResult } from "@/services/ai"

interface DocumentFullSummaryViewProps {
  summary: AnalysisResult | null
  loading: boolean
  onGenerate: () => Promise<void>
  onNavigateToPage: (pageNumber: number) => void
  isCloudAiReady?: boolean
}

export function DocumentFullSummaryView({
  summary,
  loading,
  onGenerate,
  onNavigateToPage,
  isCloudAiReady,
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

  const isMock =
    summary?.provider === "mock-ai-provider" ||
    summary?.model === "mock-doc-v1" ||
    (isCloudAiReady === false && summary !== null)

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground space-y-3">
        <FileCheck className="size-8 text-muted-foreground/60" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Chưa có bản tóm tắt toàn diện</p>
          <p className="text-[11px] max-w-sm">
            Tài liệu này chưa có bản phân tích tổng quát. Bạn có thể yêu cầu tạo tóm tắt và trích xuất dữ liệu quan trọng ngay bây giờ.
          </p>
        </div>

        {isCloudAiReady === false && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 max-w-md text-left">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[11px]">Chưa kích hoạt Cloud AI (OpenAI)</p>
              <p className="text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
                Ứng dụng đang ở chế độ ngoại tuyến mô phỏng. Khi tạo tóm tắt, hệ thống sẽ sử dụng dữ liệu mẫu từ Mock AI Provider. Để phân tích tài liệu thực tế với OpenAI, vui lòng vào <strong>Cài đặt</strong> để nhập API Key và bật Cloud AI.
              </p>
            </div>
          </div>
        )}

        <Button size="sm" onClick={onGenerate} className="gap-1.5 text-xs cursor-pointer">
          <FileCheck className="size-3.5" />
          <span>Tạo tóm tắt tài liệu</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-5 text-xs">
      {/* Mock AI Provider Advisory Banner */}
      {isMock && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-xs">Bản tóm tắt từ Mô hình Mô phỏng (Mock AI Provider)</p>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.2 font-medium text-[10px] text-amber-800 dark:text-amber-300">
                Chưa bật Cloud AI
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
              Tài liệu này được tạo bởi bộ mô phỏng (Mock AI Provider) do chưa cấu hình OpenAI API Key. Kết quả tóm tắt và các trường dữ liệu dưới đây là <strong>dữ liệu mẫu minh họa</strong>, không phản ánh nội dung thực tế do AI suy luận. Vui lòng vào mục <strong>Cài đặt &rarr; Mô hình phân tích</strong> để cấu hình API Key và kích hoạt Cloud AI.
            </p>
          </div>
        </div>
      )}

      {/* Header: Classification & Reprocess Button */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Phân loại tài liệu:</span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary uppercase text-[10px]">
            {summary.documentType}
          </span>
          {isMock && (
            <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300 text-[10px]">
              Mô phỏng (Mock AI)
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={onGenerate}
          disabled={loading}
          className="gap-1 text-[11px] cursor-pointer"
          title="Chạy lại phân tích tổng thể tài liệu"
        >
          <RefreshCw className="size-3" />
          <span>Phân tích lại</span>
        </Button>
      </div>

      {/* Section 1: Main Summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground text-xs select-none">Tóm tắt nội dung chính:</h4>
          {isMock && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              (Nội dung mô phỏng)
            </span>
          )}
        </div>
        <p className="leading-relaxed text-foreground select-text font-normal">{summary.summary}</p>
      </div>

      {/* Section 2: Extracted Fields (Flattened list) */}
      {summary.fields && summary.fields.length > 0 && (
        <div className="space-y-2 border-t border-border/50 pt-4">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 select-none">
            <Layers className="size-3.5 text-muted-foreground" />
            <span>Các trường dữ liệu được trích xuất</span>
            {isMock && (
              <span className="text-[10px] font-normal text-muted-foreground">(Dữ liệu mẫu)</span>
            )}
          </h4>
          <div className="divide-y divide-border/40">
            {summary.fields.map((field, idx) => (
              <div key={idx} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="font-medium text-foreground">{field.name}:</span>
                  <span className="text-muted-foreground">{String(field.value ?? "—")}</span>
                  {field.evidence?.citations?.[0] && (
                    <button
                      type="button"
                      onClick={() => onNavigateToPage(field.evidence.citations[0]!.pageNumber)}
                      className="inline-flex items-center gap-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary px-1.5 py-0.2 text-[10px] font-semibold transition-colors cursor-pointer border border-primary/20"
                      title={`Xem trang ${field.evidence.citations[0]!.pageNumber}`}
                    >
                      <span>{`Trang ${field.evidence.citations[0]!.pageNumber}`}</span>
                      <ArrowUpRight className="size-2" />
                    </button>
                  )}
                </div>
                <StatusBadge status={field.semanticStatus} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Evidence & Citations */}
      {summary.evidences && summary.evidences.length > 0 && (
        <div className="space-y-3 border-t border-border/50 pt-4">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 select-none">
            <Quote className="size-3.5 text-muted-foreground" />
            <span>Bằng chứng trích dẫn</span>
          </h4>
          <div className="space-y-2.5">
            {summary.evidences.map((evidence, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-foreground select-text text-xs">{evidence.claim}</p>
                  <StatusBadge status={evidence.status} />
                </div>
                {evidence.reasoning && (
                  <p className="text-[11px] text-muted-foreground italic select-text">
                    {evidence.reasoning}
                  </p>
                )}
                {evidence.citations && evidence.citations.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/40">
                    {evidence.citations.map((c, cIdx) => (
                      <div
                        key={cIdx}
                        className="rounded bg-background p-2 border border-border/40 text-[11px] space-y-1"
                      >
                        <button
                          type="button"
                          onClick={() => onNavigateToPage(c.pageNumber)}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
                        >
                          <span>{`Trang ${c.pageNumber}`}</span>
                          <ArrowUpRight className="size-2.5" />
                        </button>
                        {c.sourceText && (
                          <blockquote className="border-l-2 border-primary/50 pl-2 italic text-foreground/90 select-text text-[11px]">
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
