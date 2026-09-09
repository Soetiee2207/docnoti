import { useState } from "react"
import { ArrowLeft, FileText, Sparkles, FileCheck2, CheckSquare, RotateCw, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocumentViewer } from "./DocumentViewer"
import { DocumentAnalysisQaView } from "./DocumentAnalysisQaView"
import { DocumentFullSummaryView } from "./DocumentFullSummaryView"
import { TaskCard } from "@/components/tasks/TaskCard"
import { useDocumentAnalysis } from "@/hooks/useDocumentAnalysis"
import { useTasks } from "@/hooks/useTasks"
import { useDocuments } from "@/hooks/useDocuments"

interface DocumentDetailViewProps {
  documentId: string
  onBack: () => void
}

type DetailTab = "qa" | "summary" | "tasks"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function DocumentDetailView({ documentId, onBack }: DocumentDetailViewProps) {
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
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
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
              <span className="text-xs font-semibold text-foreground truncate max-w-[280px]">
                {document.name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({formatBytes(document.fileSize)})
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
              <span>{reprocessing ? "Đang xử lý lại..." : "Xử lý lại tài liệu"}</span>
            </Button>
          )}
        </div>

        {/* View Switcher Tabs & Delete action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
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
                  void handleGenerateSummary(false)
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
            <button
              type="button"
              onClick={() => {
                setActiveTab("tasks")
                void reloadTasks()
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "tasks"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckSquare className="size-3.5 text-amber-500" />
              <span>Nhiệm vụ</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            title="Xóa tài liệu này"
          >
            <Trash2 className="size-3.5" />
            <span>Xóa tài liệu</span>
          </Button>
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
            />
          )}

          {activeTab === "summary" && (
            <DocumentFullSummaryView
              summary={fullSummary}
              loading={loadingSummary}
              onGenerate={() => handleGenerateSummary(true)}
              onNavigateToPage={setCurrentPage}
            />
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <CheckSquare className="size-3.5 text-muted-foreground" />
                    Nhiệm vụ & Hạn chót từ tài liệu này ({tasks.length})
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Xác nhận hoặc chỉnh sửa các hành động được AI gợi ý dựa trên bằng chứng
                  </p>
                </div>
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
                  <p className="mt-1 text-[11px] max-w-xs">
                    Hãy thực hiện phân tích tóm tắt toàn văn hoặc hỏi đáp để hệ thống trích xuất nhiệm vụ.
                  </p>
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
                <p className="text-xs text-muted-foreground">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Bạn có chắc chắn muốn xóa tài liệu <span className="font-semibold text-foreground">"{document?.name}"</span>?
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-md border border-amber-500/20">
                ⚠️ Toàn bộ dữ liệu liên quan (trang văn bản, chỉ mục tìm kiếm FTS, vector embeddings, phân tích tóm tắt, nhiệm vụ và công việc xử lý) cùng tệp lưu trữ vật lý sẽ bị xóa vĩnh viễn.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="cursor-pointer text-xs"
              >
                Hủy
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteDocument()}
                disabled={deleting}
                className="gap-1.5 cursor-pointer text-xs"
              >
                {deleting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" />
                    <span>Xác nhận xóa</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

