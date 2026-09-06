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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge, SourceBadge } from "./EvidenceBadge"
import type { AnalysisResult, BuiltContext } from "@/services/ai"

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
}: DocumentAnalysisQaViewProps) {
  const [submittedQuery, setSubmittedQuery] = useState<string>("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!question.trim() || analyzing) return
    setSubmittedQuery(question.trim())
    await onAsk(question.trim())
  }

  // Create lookup for matching chunk retrieval sources
  const chunkSourceMap = new Map<string, "lexical" | "vector" | "both">()
  if (context?.chunks) {
    for (const chunk of context.chunks) {
      chunkSourceMap.set(chunk.content.trim().toLowerCase(), chunk.retrievalSources)
    }
  }

  return (
    <div className="space-y-4">
      {/* Question Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Đặt câu hỏi về tài liệu này..."
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            disabled={analyzing}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!question.trim() || analyzing}
          className="h-9 gap-1.5 px-4 text-xs shrink-0"
        >
          {analyzing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Đang tra cứu...</span>
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              <span>Hỏi đáp</span>
            </>
          )}
        </Button>
      </form>

      {/* Analyzing Progress State */}
      {analyzing && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-primary">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Đang tìm kiếm bằng chứng và phân tích nội dung...</p>
            <p className="text-[11px] text-muted-foreground">
              Kết hợp tìm kiếm FTS5 lexical và vector embedding qua Reciprocal Rank Fusion (RRF)
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && !analyzing && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Lỗi phân tích tài liệu</p>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Degraded Retrieval Notification */}
      {isDegraded && !analyzing && (
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

      {/* Empty Retrieval Notification */}
      {noCandidates && !analyzing && (
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

      {/* Q&A Results Rendering */}
      {result && !analyzing && (
        <div className="space-y-4">
          {/* Answer Card */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Câu trả lời cho: <span className="text-primary italic">"{submittedQuery || question}"</span>
              </span>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                {result.documentType}
              </span>
            </div>

            <div className="mt-3 text-xs leading-relaxed text-foreground select-text">
              {result.summary}
            </div>
          </div>

          {/* Extracted Fields (if any) */}
          {result.fields && result.fields.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2.5">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-muted-foreground" />
                Thông tin trích xuất cụ thể
              </h4>
              <div className="divide-y divide-border/60 text-xs">
                {result.fields.map((field, idx) => (
                  <div key={idx} className="py-2 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground">{field.name}: </span>
                      <span className="text-muted-foreground">{String(field.value ?? "—")}</span>
                      {field.evidence?.citations?.[0] && (
                        <button
                          type="button"
                          onClick={() => onNavigateToPage(field.evidence.citations[0]!.pageNumber)}
                          className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                        >
                          Trang {field.evidence.citations[0]!.pageNumber}
                          <ArrowUpRight className="size-2.5" />
                        </button>
                      )}
                    </div>
                    <StatusBadge status={field.semanticStatus} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Citations Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Quote className="size-3.5 text-muted-foreground" />
                Bằng chứng & Căn cứ xác thực ({result.evidences?.length ?? 0})
              </h4>
              {context && (
                <span className="text-[10px] text-muted-foreground">
                  Gốc từ {context.chunks.length} đoạn trích xuất ({context.diagnostics.totalCharacters} ký tự)
                </span>
              )}
            </div>

            {(!result.evidences || result.evidences.length === 0) ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
                Không có bằng chứng cụ thể nào được trích xuất cho câu trả lời này.
              </div>
            ) : (
              <div className="space-y-2.5">
                {result.evidences.map((evidence, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border bg-card p-3.5 shadow-xs space-y-2 text-xs"
                  >
                    {/* Evidence Header */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground select-text">{evidence.claim}</p>
                      <StatusBadge status={evidence.status} />
                    </div>

                    {/* Reasoning */}
                    {evidence.reasoning && (
                      <p className="text-[11px] text-muted-foreground italic select-text">
                        {evidence.reasoning}
                      </p>
                    )}

                    {/* Citations List */}
                    {evidence.citations && evidence.citations.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-border/40">
                        {evidence.citations.map((citation, cIdx) => {
                          const normalizedQuote = citation.sourceText?.trim().toLowerCase() ?? ""
                          const matchedSource = chunkSourceMap.get(normalizedQuote)

                          return (
                            <div
                              key={cIdx}
                              className="rounded-md bg-muted/30 p-2.5 border border-border/50 text-[11px] space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => onNavigateToPage(citation.pageNumber)}
                                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
                                  title={`Xem trang ${citation.pageNumber} trên trình xem văn bản`}
                                >
                                  <span>Trang {citation.pageNumber}</span>
                                  <ArrowUpRight className="size-3" />
                                </button>
                                <SourceBadge source={matchedSource} />
                              </div>

                              {citation.sourceText && (
                                <blockquote className="border-l-2 border-primary/40 pl-2 text-[11px] italic text-foreground/90 select-text">
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
        </div>
      )}

      {/* Initial Empty State before first question */}
      {!result && !analyzing && !error && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center text-xs text-muted-foreground space-y-2">
          <Search className="mx-auto size-6 text-muted-foreground/60" />
          <p className="font-medium text-foreground">Tra cứu thông tin theo bằng chứng</p>
          <p className="text-[11px] max-w-sm mx-auto">
            Nhập câu hỏi cụ thể về ngày tháng, số tiền, điều khoản, bên liên quan hoặc nghĩa vụ trong tài liệu này để nhận câu trả lời kèm trích dẫn trang và đoạn văn bản xác thực.
          </p>
        </div>
      )}
    </div>
  )
}
