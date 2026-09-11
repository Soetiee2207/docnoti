import { useState } from "react"
import {
  ArrowLeft,
  FileText,
  Sparkles,
  FileCheck2,
  CheckSquare,
  RotateCw,
  Trash2,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocumentViewer } from "./DocumentViewer"
import { DocumentAnalysisQaView } from "./DocumentAnalysisQaView"
import { DocumentFullSummaryView } from "./DocumentFullSummaryView"
import { TaskCard } from "@/components/tasks/TaskCard"
import { useDocumentAnalysis } from "@/hooks/useDocumentAnalysis"
import { useTasks } from "@/hooks/useTasks"
import { useDocuments } from "@/hooks/useDocuments"
import { useAiConfig } from "@/hooks/useAiConfig"
import { useSecrets } from "@/hooks/useSecrets"

interface DocumentDetailViewProps {
  documentId: string
  onBack: () => void
  onToggleFocusMode?: () => void
  isFocusMode?: boolean
}

type DetailTab = "qa" | "summary" | "tasks"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function DocumentDetailView({
  documentId,
  onBack,
  onToggleFocusMode,
  isFocusMode = false,
}: DocumentDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("qa")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { deleteDocument } = useDocuments()

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
    qaHistory,
    clearQaHistory,
    askQuestion,
    fullSummary,
    loadingSummary,
    loadFullSummary,
    reprocessDocument,
    reprocessing,
  } = useDocumentAnalysis(documentId)

  const {
    tasks,
    loading: loadingTasks,
    pendingCount,
    confirmTask,
    rejectTask,
    reloadTasks,
  } = useTasks({ documentId })

  const { cloudEnabled } = useAiConfig()
  const { isConfigured: isApiKeyConfigured } = useSecrets()
  const isCloudAiReady = cloudEnabled && isApiKeyConfigured

  const handleGenerateSummary = async (forceRefresh = false) => {
    await loadFullSummary(forceRefresh)
    await reloadTasks()
  }

  const handleDeleteDocument = async () => {
    try {
      setDeleting(true)
      const success = await deleteDocument(documentId)
      if (success) {
        setShowDeleteConfirm(false)
        onBack()
      }
    } catch (err) {
      console.error("Failed to delete document:", err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-xs h-8 cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Danh sách</span>
          </Button>

          {document && (
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate max-w-[240px] sm:max-w-[320px]">
                {document.name}
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {formatBytes(document.fileSize)}
              </span>
            </div>
          )}

          {(document?.status === "failed" || pages.length === 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reprocessDocument()}
              disabled={reprocessing}
              className="gap-1.5 text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
              title="Xử lý lại trích xuất văn bản và OCR cho tài liệu này"
            >
              <RotateCw className={`size-3.5 ${reprocessing ? "animate-spin" : ""}`} />
              <span>{reprocessing ? "Đang xử lý lại..." : "Xử lý lại"}</span>
            </Button>
          )}
        </div>

        {/* View Switcher Tabs, Focus Mode & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("qa")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                activeTab === "qa"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>Hỏi đáp</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("summary")
                if (!fullSummary && !loadingSummary) {
                  void handleGenerateSummary(false)
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                activeTab === "summary"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileCheck2 className="size-3.5 text-muted-foreground" />
              <span>Tóm tắt</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("tasks")
                void reloadTasks()
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors cursor-pointer ${
                activeTab === "tasks"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckSquare className="size-3.5 text-amber-500" />
              <span>Nhiệm vụ</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {/* Focus Mode Toggle */}
          {onToggleFocusMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFocusMode}
              className="gap-1.5 text-xs h-8 cursor-pointer"
              title={isFocusMode ? "Thu nhỏ (Hiện thanh menu)" : "Chế độ tập trung (Ẩn menu)"}
            >
              {isFocusMode ? (
                <>
                  <Minimize2 className="size-3.5" />
                  <span className="hidden md:inline">Thoát tập trung</span>
                </>
              ) : (
                <>
                  <Maximize2 className="size-3.5" />
                  <span className="hidden md:inline">Tập trung</span>
                </>
              )}
            </Button>
          )}

          {/* Delete Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            title="Xóa tài liệu này"
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Xóa</span>
          </Button>
        </div>
      </div>

      {/* Two-Panel Split Layout (LEFT: Intelligence / RIGHT: Document Viewer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Q&A / Analysis Intelligence Panel (6 cols) */}
        <div className="lg:col-span-6 order-2 lg:order-1">
          {activeTab === "qa" && (
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
              qaHistory={qaHistory}
              onClearHistory={clearQaHistory}
              isCloudAiReady={isCloudAiReady}
            />
          )}

          {activeTab === "summary" && (
            <DocumentFullSummaryView
              summary={fullSummary}
              loading={loadingSummary}
              onGenerate={() => handleGenerateSummary(true)}
              onNavigateToPage={setCurrentPage}
              isCloudAiReady={isCloudAiReady}
            />
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <CheckSquare className="size-3.5 text-muted-foreground" />
                  Nhiệm vụ & Hạn chót từ tài liệu ({tasks.length})
                </h3>
              </div>

              {loadingTasks && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Đang tải danh sách nhiệm vụ...
                </div>
              )}

              {!loadingTasks && tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                  <CheckSquare className="size-7 text-muted-foreground/50 mb-2" />
                  <p className="text-xs font-medium text-foreground">Chưa có nhiệm vụ nào cho tài liệu này</p>
                </div>
              )}

              {!loadingTasks && tasks.length > 0 && (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onConfirm={confirmTask}
                      onReject={rejectTask}
                      onNavigateToPage={setCurrentPage}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Document Viewer (6 cols) */}
        <div className="lg:col-span-6 order-1 lg:order-2 sticky top-4">
          <DocumentViewer
            pages={pages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            loading={loadingDoc}
            storagePath={document?.storagePath}
          />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Xác nhận xóa tài liệu</h3>
                <p className="text-xs text-muted-foreground">
                  Hành động này sẽ xóa vĩnh viễn tệp tài liệu, văn bản trích xuất, vector embeddings và toàn bộ các nhiệm vụ liên quan.
                </p>
              </div>
            </div>

            <p className="text-xs text-foreground/80 bg-muted/30 p-2.5 rounded-lg border border-border">
              Tài liệu: <strong>{document?.name}</strong>
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="text-xs cursor-pointer"
              >
                Hủy bỏ
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteDocument}
                disabled={deleting}
                className="text-xs cursor-pointer"
              >
                {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
