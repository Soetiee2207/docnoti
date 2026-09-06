import { CheckCircle2, HelpCircle, AlertTriangle, Sparkles, Search, Layers } from "lucide-react"
import type { SemanticStatus } from "@/services/ai"
import type { RetrievalSource } from "@/services/retrieval"

export function StatusBadge({ status }: { status: SemanticStatus }) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="size-3" />
          Xác thực
        </span>
      )
    case "INFERRED":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <HelpCircle className="size-3" />
          Suy luận
        </span>
      )
    case "UNCERTAIN":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="size-3" />
          Chưa chắc chắn
        </span>
      )
  }
}

export function SourceBadge({ source }: { source?: RetrievalSource | null }) {
  if (!source) return null

  switch (source) {
    case "both":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400 border border-purple-500/20" title="Bằng chứng tìm thấy qua cả từ khóa FTS5 và vector ngữ nghĩa">
          <Sparkles className="size-2.5" />
          FTS5 + Vector
        </span>
      )
    case "lexical":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-600 dark:text-sky-400 border border-sky-500/20" title="Bằng chứng tìm thấy qua tìm kiếm từ khóa FTS5">
          <Search className="size-2.5" />
          Từ khóa FTS5
        </span>
      )
    case "vector":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-500/20" title="Bằng chứng tìm thấy qua tìm kiếm vector tương đồng">
          <Layers className="size-2.5" />
          Vector ngữ nghĩa
        </span>
      )
  }
}
