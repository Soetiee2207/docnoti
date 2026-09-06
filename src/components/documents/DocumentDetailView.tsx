import { useState } from "react"
import { ArrowLeft, FileText, Sparkles, FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocumentViewer } from "./DocumentViewer"
import { DocumentAnalysisQaView } from "./DocumentAnalysisQaView"
import { DocumentFullSummaryView } from "./DocumentFullSummaryView"
import { useDocumentAnalysis } from "@/hooks/useDocumentAnalysis"

interface DocumentDetailViewProps {
  documentId: string
  onBack: () => void
}

type DetailTab = "qa" | "summary"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function DocumentDetailView({ documentId, onBack }: DocumentDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("qa")

  const {
    document,
    pages,
    currentPage,
    setCurrentPage,
    loadingDoc,
    question,
    setQuestion,
    analyzing,
    error,
    qaResult,
    qaContext,
    isDegraded,
    noCandidates,
    askQuestion,
    fullSummary,
    loadingSummary,
    loadFullSummary,
  } = useDocumentAnalysis(documentId)

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-xs h-8"
          >
            <ArrowLeft className="size-3.5" />
            <span>Danh sách</span>
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary shrink-0" />
              <h2 className="text-sm font-semibold tracking-tight text-foreground" title={document?.name}>
                {document?.name ?? "Chi tiết tài liệu"}
              </h2>
            </div>
            {document && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatBytes(document.fileSize)} • {pages.length} trang đã trích xuất • Trạng thái:{" "}
                <span className="font-medium text-foreground">{document.status}</span>
              </p>
            )}
          </div>
        </div>

        {/* Intelligence Tab Switcher */}
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("qa")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
              activeTab === "qa"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>Hỏi đáp & Bằng chứng</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("summary")
              if (!fullSummary && !loadingSummary) {
                void loadFullSummary()
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
              activeTab === "summary"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCheck2 className="size-3.5 text-muted-foreground" />
            <span>Tóm tắt tổng quan</span>
          </button>
        </div>
      </div>

      {/* Two-Panel Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Document Page Viewer (5 cols) */}
        <div className="lg:col-span-5 sticky top-4">
          <DocumentViewer
            pages={pages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            loading={loadingDoc}
          />
        </div>

        {/* Right Column: Q&A / Analysis Intelligence Panel (7 cols) */}
        <div className="lg:col-span-7">
          {activeTab === "qa" ? (
            <DocumentAnalysisQaView
              question={question}
              onQuestionChange={setQuestion}
              onAsk={askQuestion}
              analyzing={analyzing}
              error={error}
              result={qaResult}
              context={qaContext}
              isDegraded={isDegraded}
              noCandidates={noCandidates}
              onNavigateToPage={setCurrentPage}
            />
          ) : (
            <DocumentFullSummaryView
              summary={fullSummary}
              loading={loadingSummary}
              onGenerate={loadFullSummary}
              onNavigateToPage={setCurrentPage}
            />
          )}
        </div>
      </div>
    </div>
  )
}
