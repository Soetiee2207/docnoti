import { useState, useMemo, type DragEvent } from "react"
import {
  FileText,
  UploadCloud,
  Search,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDocuments } from "@/hooks/useDocuments"
import type { DocumentRecord } from "@/db/schema"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoString
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "processed":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          Đã xử lý
        </span>
      )
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <Loader2 className="size-3 animate-spin" />
          Đang xử lý
        </span>
      )
    case "needs_ocr":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          Cần OCR
        </span>
      )
    case "needs_review":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
          <AlertTriangle className="size-3" />
          Cần xem lại
        </span>
      )
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
          <AlertCircle className="size-3" />
          Thất bại
        </span>
      )
    case "imported":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
          <Clock className="size-3" />
          Chờ xử lý
        </span>
      )
  }
}

export function DocumentsView({
  searchQuery = "",
}: {
  searchQuery?: string
}) {
  const {
    documents,
    loading,
    error,
    importing,
    openPickerAndImport,
    importFilePaths,
  } = useDocuments()

  const [filterText, setFilterText] = useState(searchQuery)
  const [isDragOver, setIsDragOver] = useState(false)

  const filteredDocs = useMemo(() => {
    if (!filterText.trim()) return documents
    const q = filterText.toLowerCase()
    return documents.filter((doc) => doc.name.toLowerCase().includes(q))
  }, [documents, filterText])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const paths = files.map((f) => (f as unknown as { path?: string }).path || f.name)
    await importFilePaths(paths)
  }

  return (
    <div className="space-y-6">
      {/* Error / Alert Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Dropzone Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPickerAndImport}
        className={`cursor-pointer rounded-xl border border-dashed p-6 text-center transition-all ${
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:bg-muted/20"
        }`}
      >
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {importing ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </div>
        <h3 className="mt-3 text-xs font-semibold text-foreground">
          {importing
            ? "Đang sao chép và khởi tạo tài liệu..."
            : "Kéo thả tài liệu PDF vào đây hoặc nhấp để tải lên"}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Chỉ chấp nhận tệp PDF (Lưu trữ và xử lý hoàn toàn cục bộ trên máy)
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-7 text-xs"
          disabled={importing}
          onClick={(e) => {
            e.stopPropagation()
            openPickerAndImport()
          }}
        >
          {importing ? "Đang nhập..." : "Chọn file từ máy"}
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Lọc tài liệu theo tên..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-8 w-64 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredDocs.length} tài liệu hiển thị
        </span>
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Đang tải dữ liệu tài liệu...
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            {filterText.trim()
              ? "Không tìm thấy tài liệu phù hợp với từ khóa tìm kiếm."
              : "Chưa có tài liệu nào trong hệ thống. Hãy nhập tệp PDF đầu tiên của bạn!"}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Tên tệp</th>
                <th className="px-3 py-2.5 font-medium">Định dạng</th>
                <th className="px-3 py-2.5 font-medium">Dung lượng</th>
                <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                <th className="px-3 py-2.5 font-medium">Nhiệm vụ trích xuất</th>
                <th className="px-4 py-2.5 text-right font-medium">Ngày nhập</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDocs.map((doc: DocumentRecord) => (
                <tr key={doc.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="max-w-[280px] truncate" title={doc.name}>
                        {doc.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground uppercase">
                    PDF
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatBytes(doc.fileSize)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {doc.status === "processed" && "Đã xử lý (Trích xuất / OCR hoàn tất)"}
                    {doc.status === "needs_ocr" && "Không có text layer (Chờ OCR)"}
                    {doc.status === "processing" && "Đang xử lý trích xuất / OCR..."}
                    {doc.status === "failed" && "Lỗi xử lý (Trích xuất / OCR)"}
                    {doc.status === "imported" && "Chờ worker thực thi"}
                    {doc.status !== "processed" &&
                      doc.status !== "needs_ocr" &&
                      doc.status !== "processing" &&
                      doc.status !== "failed" &&
                      doc.status !== "imported" &&
                      "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
