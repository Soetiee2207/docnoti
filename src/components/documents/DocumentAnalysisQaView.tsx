import { useState, type FormEvent } from "react"
import {
  Search,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Quote,
  Layers,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge, SourceBadge } from "./EvidenceBadge"
import type { AnalysisResult, BuiltContext, QaHistoryItem } from "@/services/ai"

interface DocumentAnalysisQaViewProps {
  question: string
  onQuestionChange: (q: string) => void
  onAsk: (question?: string) => Promise<void>
  analyzing: boolean
  error: string | null
  result: AnalysisResult | null
  context: BuiltContext | null
  isDegraded: boolean
  noCandidates: boolean
  onNavigateToPage: (pageNumber: number) => void
  qaHistory?: QaHistoryItem[]
  onClearHistory?: () => void
  isCloudAiReady?: boolean
}

export function DocumentAnalysisQaView({
  question,
  onQuestionChange,
  onAsk,
  analyzing,
  error,
  result,
  context,
  isDegraded,
  noCandidates,
  onNavigateToPage,
  qaHistory = [],
  onClearHistory,
  isCloudAiReady,
}: DocumentAnalysisQaViewProps) {
  const [submittedQuery, setSubmittedQuery] = useState<string>("")
  const [collapsedEvidenceIds, setCollapsedEvidenceIds] = useState<Record<string, boolean>>({})

  const toggleEvidenceExpand = (id: string) => {
    setCollapsedEvidenceIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || analyzing) return
    setSubmittedQuery(trimmed)
    await onAsk(trimmed)
  }

  // Helper to match citation quote with retrieved chunks to determine provenance source
  const getProvenanceSource = (
    quote?: string,
    currentContext?: BuiltContext | null
  ): "lexical" | "vector" | "both" | undefined => {
    const ctx = currentContext ?? context
    if (!quote || !ctx?.chunks || ctx.chunks.length === 0) return undefined
    const normQuote = quote.trim().toLowerCase()
    if (!normQuote) return undefined

    for (const chunk of ctx.chunks) {
      const normChunk = chunk.content.trim().toLowerCase()
      if (
        normChunk === normQuote ||
        normChunk.includes(normQuote) ||
        normQuote.includes(normChunk)
      ) {
        return chunk.retrievalSources
      }
    }
    return undefined
  }

  // Extract unique citation page numbers from a result
  const getCitationPages = (res: AnalysisResult): number[] => {
    const pages = new Set<number>()
    if (res.evidences) {
      for (const ev of res.evidences) {
        if (ev.citations) {
          for (const cit of ev.citations) {
            if (cit.pageNumber > 0) {
              pages.add(cit.pageNumber)
            }
          }
        }
      }
    }
    if (res.fields) {
      for (const f of res.fields) {
        if (f.evidence?.citations) {
          for (const cit of f.evidence.citations) {
            if (cit.pageNumber > 0) {
              pages.add(cit.pageNumber)
            }
          }
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b)
  }

  // Construct list of items to render: prioritize qaHistory, fallback to single result
  const displayItems: QaHistoryItem[] =
    qaHistory.length > 0
      ? qaHistory
      : result
      ? [
          {
            id: "initial-result",
            question: submittedQuery || question || "Phân tích tài liệu",
            result,
            context,
            isDegraded,
            noCandidates,
            timestamp: 0,
          },
        ]
      : []

  return (
    <div className="flex flex-col gap-4">
      {/* Header with Q&A control */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Hỏi đáp tài liệu</h3>
          {displayItems.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.2 text-[10px] font-medium text-secondary-foreground">
              {displayItems.length} câu hỏi
            </span>
          )}
        </div>
        {onClearHistory && displayItems.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onClearHistory}
            className="text-[11px] text-muted-foreground hover:text-destructive gap-1 h-7 cursor-pointer"
            title="Xóa toàn bộ lịch sử hỏi đáp của phiên này"
          >
            <Trash2 className="size-3" />
            <span>Xóa hội thoại</span>
          </Button>
        )}
      </div>

      {/* Conversation Thread / Result List */}
      <div className="space-y-4">
        {displayItems.map((item, index) => {
          const itemRes = item.result
          const itemAnswer = itemRes.answer || itemRes.summary
          const citationPages = getCitationPages(itemRes)
          const isEvidenceExpanded = !collapsedEvidenceIds[item.id]
          const evidenceCount = itemRes.evidences?.length ?? 0

          return (
            <div
              key={item.id || index}
              className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3.5 transition-all"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    Q
                  </div>
                  <span className="font-semibold text-xs text-foreground truncate select-text">
                    {item.question}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                    {itemRes.documentType}
                  </span>
                  {(itemRes.provider === "mock-ai-provider" || itemRes.model === "mock-doc-v1" || isCloudAiReady === false) && (
                    <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      Mô phỏng (Mock AI)
                    </span>
                  )}
                  <StatusBadge status={itemRes.confidence || "VERIFIED"} />
                </div>
              </div>

              {/* Mock AI Advisory Banner */}
              {(itemRes.provider === "mock-ai-provider" || itemRes.model === "mock-doc-v1" || isCloudAiReady === false) && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[11px]">Câu trả lời từ Mô hình Mô phỏng (Mock AI Provider)</p>
                    <p className="text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
                      Ứng dụng chưa kích hoạt Cloud AI hoặc chưa lưu OpenAI API Key. Câu trả lời này được tạo từ bộ sinh mẫu (Mock AI) và không phản ánh nội dung suy luận thực tế. Vui lòng vào <strong>Cài đặt</strong> để nhập API Key và bật Cloud AI.
                    </p>
                  </div>
                </div>
              )}

              {/* Degraded / Empty Warnings */}
              {item.isDegraded && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Chế độ truy xuất hạn chế (Degraded Mode)</p>
                    <p className="text-[11px] leading-relaxed">
                      Semantic search hiện không khả dụng; kết quả đang dựa trên tìm kiếm từ khóa.
                    </p>
                  </div>
                </div>
              )}
              {item.noCandidates && (
                <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-400">
                  <Info className="size-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Không tìm thấy căn cứ phù hợp</p>
                    <p className="text-[11px] leading-relaxed">
                      Không tìm thấy nội dung liên quan trong tài liệu cho câu hỏi này. Phân tích không thể xác minh bằng chứng đáng tin cậy.
                    </p>
                  </div>
                </div>
              )}

              {/* Main Natural Answer Body */}
              <div className="text-xs leading-relaxed text-foreground select-text whitespace-pre-line font-normal">
                {itemAnswer}
              </div>

              {/* Citation Source Navigation Element */}
              {citationPages.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 select-none">
                    <FileText className="size-3" />
                    Nguồn:
                  </span>
                  {citationPages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => onNavigateToPage(page)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer border border-primary/20"
                      title={`Nhấp để mở trang ${page} trên tài liệu`}
                    >
                      <span>{`Trang ${page}`}</span>
                      <ArrowUpRight className="size-2.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Collapsible Evidence Section (Technical details inside) */}
              {evidenceCount > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => toggleEvidenceExpand(item.id)}
                    className="flex items-center justify-between w-full text-left py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer group select-none"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-[11px]">
                      <Quote className="size-3 text-primary" />
                      <span>{`Chi tiết bằng chứng xác thực (${evidenceCount})`}</span>
                    </span>
                    {isEvidenceExpanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </button>

                  {isEvidenceExpanded && (
                    <div className="mt-2 space-y-2">
                      {itemRes.evidences?.map((evidence, evIdx) => (
                        <div
                          key={evIdx}
                          className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-1.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-foreground select-text text-[11px]">{evidence.claim}</p>
                            <StatusBadge status={evidence.status} />
                          </div>

                          {evidence.reasoning && (
                            <p className="text-[10px] text-muted-foreground italic select-text">
                              {evidence.reasoning}
                            </p>
                          )}

                          {evidence.citations && evidence.citations.length > 0 && (
                            <div className="space-y-1.5 pt-0.5">
                              {evidence.citations.map((citation, cIdx) => {
                                const matchedSource = getProvenanceSource(
                                  citation.sourceText,
                                  item.context as BuiltContext | null | undefined
                                )

                                return (
                                  <div
                                    key={cIdx}
                                    className="rounded-md bg-background/80 p-2 border border-border/50 text-[11px] space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onNavigateToPage(citation.pageNumber)}
                                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
                                      >
                                        <span>{`Trang ${citation.pageNumber}`}</span>
                                        <ArrowUpRight className="size-2.5" />
                                      </button>
                                      <SourceBadge source={matchedSource} />
                                    </div>

                                    {citation.sourceText && (
                                      <blockquote className="border-l-2 border-primary/50 pl-2 text-[10px] italic text-foreground/90 select-text">
                                        "{citation.sourceText}"
                                      </blockquote>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Extracted Fields (if any) */}
              {itemRes.fields && itemRes.fields.length > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-1.5">
                  <h5 className="text-[11px] font-semibold text-foreground flex items-center gap-1 select-none">
                    <Layers className="size-3 text-muted-foreground" />
                    Trường thông tin trích xuất:
                  </h5>
                  <div className="divide-y divide-border/40 text-xs">
                    {itemRes.fields.map((f, fIdx) => (
                      <div key={fIdx} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-foreground">{f.name}:</span>
                          <span className="text-muted-foreground truncate">{String(f.value ?? "—")}</span>
                        </div>
                        <StatusBadge status={f.semanticStatus} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Analyzing Progress State */}
      {analyzing && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-primary shadow-xs animate-pulse">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Đang tìm kiếm bằng chứng và phân tích nội dung...</p>
            <p className="text-[11px] text-muted-foreground">
              Tra cứu hybrid FTS5 + vector embedding RRF, đối chiếu trích dẫn chính xác theo trang
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && !analyzing && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Lỗi phân tích tài liệu</p>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Initial Empty State before any question */}
      {displayItems.length === 0 && !analyzing && !error && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center text-xs text-muted-foreground space-y-3">
          <Search className="mx-auto size-7 text-primary/70" />
          <div className="space-y-1">
            <p className="font-medium text-sm text-foreground">Tra cứu thông tin theo bằng chứng</p>
            <p className="text-[11px] max-w-sm mx-auto leading-relaxed">
              Đặt bất kỳ câu hỏi nào về nội dung, số liệu, ngày tháng, nhiệm vụ hoặc điều khoản trong tài liệu này để nhận câu trả lời kèm trích dẫn trang và đoạn văn bản xác thực.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap justify-center gap-1.5">
            <button
              type="button"
              onClick={() => onQuestionChange("Nội dung chính của tài liệu này là gì?")}
              className="rounded-full bg-secondary/80 hover:bg-secondary px-3 py-1 text-[11px] text-secondary-foreground transition-colors cursor-pointer"
            >
              "Nội dung chính của tài liệu này là gì?"
            </button>
            <button
              type="button"
              onClick={() => onQuestionChange("Có các thời hạn hoặc nhiệm vụ nào cần thực hiện?")}
              className="rounded-full bg-secondary/80 hover:bg-secondary px-3 py-1 text-[11px] text-secondary-foreground transition-colors cursor-pointer"
            >
              "Có các thời hạn hoặc nhiệm vụ nào?"
            </button>
          </div>
        </div>
      )}

      {/* Pre-question Mock notice if Cloud AI is not configured */}
      {isCloudAiReady === false && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Info className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] leading-tight">
            Cloud AI chưa được cấu hình. Hỏi đáp đang hoạt động ở chế độ mô phỏng (Mock AI). Vui lòng vào <strong>Cài đặt</strong> để nhập OpenAI API Key để trả lời chính xác theo tài liệu.
          </span>
        </div>
      )}

      {/* Persistent Question Input Form (Follow-up input) */}
      <form onSubmit={handleSubmit} className="sticky bottom-0 bg-background/95 backdrop-blur-xs pt-2 pb-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={
                displayItems.length > 0
                  ? "Đặt câu hỏi tiếp theo về tài liệu này..."
                  : "Đặt câu hỏi về tài liệu này..."
              }
              value={question}
              onChange={(e) => onQuestionChange(e.target.value)}
              disabled={analyzing}
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring shadow-xs disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!question.trim() || analyzing}
            className="h-10 gap-1.5 px-4 text-xs shrink-0 cursor-pointer"
          >
            {analyzing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Đang tra cứu...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                <span>{displayItems.length > 0 ? "Hỏi tiếp" : "Hỏi đáp"}</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
