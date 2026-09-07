import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type { DocumentRecord, DocumentPageRecord } from "@/db/schema"
import type { AnalysisResult, BuiltContext, QaHistoryItem } from "@/services/ai"

export interface UseDocumentAnalysisResult {
  document: DocumentRecord | null
  pages: DocumentPageRecord[]
  currentPage: number
  setCurrentPage: (page: number) => void
  loadingDoc: boolean
  question: string
  setQuestion: (q: string) => void
  analyzing: boolean
  error: string | null
  qaResult: AnalysisResult | null
  qaContext: BuiltContext | null
  isDegraded: boolean
  noCandidates: boolean
  qaHistory: QaHistoryItem[]
  clearQaHistory: () => void
  askQuestion: (customQuestion?: string) => Promise<void>
  fullSummary: AnalysisResult | null
  loadingSummary: boolean
  loadFullSummary: () => Promise<void>
  reloadDocument: () => Promise<void>
  reprocessDocument: () => Promise<void>
  reprocessing: boolean
}

export function useDocumentAnalysis(documentId: string): UseDocumentAnalysisResult {
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [pages, setPages] = useState<DocumentPageRecord[]>([])
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loadingDoc, setLoadingDoc] = useState<boolean>(true)

  const [question, setQuestion] = useState<string>("")
  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [qaResult, setQaResult] = useState<AnalysisResult | null>(null)
  const [qaContext, setQaContext] = useState<BuiltContext | null>(null)
  const [isDegraded, setIsDegraded] = useState<boolean>(false)
  const [noCandidates, setNoCandidates] = useState<boolean>(false)
  const [qaHistory, setQaHistory] = useState<QaHistoryItem[]>([])

  const [fullSummary, setFullSummary] = useState<AnalysisResult | null>(null)
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false)
  const [reprocessing, setReprocessing] = useState<boolean>(false)

  const reloadDocument = useCallback(async () => {
    if (!documentId) return
    try {
      setLoadingDoc(true)
      const services = await getAppServices()
      const doc = await services.documentRepo.findById(documentId)
      setDocument(doc)

      const docPages = await services.pageRepo.findByDocumentId(documentId)
      const sorted = [...docPages].sort((a, b) => a.pageNumber - b.pageNumber)
      setPages(sorted)

      if (sorted.length > 0) {
        setCurrentPage((prev) => {
          const exists = sorted.some((p) => p.pageNumber === prev)
          return exists ? prev : sorted[0]!.pageNumber
        })
      }

      // Check for an existing saved analysis record (full summary)
      if (services.analysisRepo) {
        const active = await services.analysisRepo.getActiveAnalysis(documentId)
        if (active && active.rawResult) {
          try {
            setFullSummary(JSON.parse(active.rawResult) as AnalysisResult)
          } catch {
            // ignore JSON parse error
          }
        }
      }
    } catch (err) {
      console.error("Failed to load document details:", err)
      setError("Không thể tải thông tin chi tiết của tài liệu.")
    } finally {
      setLoadingDoc(false)
    }
  }, [documentId])

  useEffect(() => {
    queueMicrotask(() => {
      void reloadDocument()
    })
  }, [reloadDocument])

  const askQuestion = useCallback(
    async (customQuestion?: string) => {
      // Prevent duplicate submission while already analyzing
      if (analyzing) return

      const q = (customQuestion ?? question).trim()
      if (!q) return

      setAnalyzing(true)
      setError(null)
      setIsDegraded(false)
      setNoCandidates(false)

      try {
        const services = await getAppServices()
        const { result, context } = await services.analysisService.analyzeWithRetrieval(
          documentId,
          q
        )

        setQaResult(result)
        setQaContext(context ?? null)

        // Check diagnostic warnings
        const degraded = result.warnings.some((w) => w.code === "RETRIEVAL_DEGRADED")
        const empty = result.warnings.some((w) => w.code === "NO_RETRIEVAL_CANDIDATES")
        setIsDegraded(degraded)
        setNoCandidates(empty)

        const historyItem: QaHistoryItem = {
          id: crypto.randomUUID(),
          question: q,
          result,
          context: context ?? null,
          isDegraded: degraded,
          noCandidates: empty,
          timestamp: Date.now(),
        }
        setQaHistory((prev) => [...prev, historyItem])
        setQuestion("")
      } catch (err) {
        console.error("Retrieval analysis error:", err)
        setError(
          err instanceof Error
            ? err.message
            : "Đã xảy ra lỗi trong quá trình phân tích và tra cứu tài liệu."
        )
      } finally {
        setAnalyzing(false)
      }
    },
    [documentId, question, analyzing]
  )

  const loadFullSummary = useCallback(async () => {
    if (loadingSummary) return
    setLoadingSummary(true)
    setError(null)
    try {
      const services = await getAppServices()

      // First check active analysis in repo
      if (services.analysisRepo) {
        const active = await services.analysisRepo.getActiveAnalysis(documentId)
        if (active && active.rawResult) {
          try {
            setFullSummary(JSON.parse(active.rawResult) as AnalysisResult)
            return
          } catch {
            // continue to generate if corrupt
          }
        }
      }

      // Generate full summary if not present
      const { result } = await services.analysisService.analyzeDocument(documentId, {
        mode: "full",
      })
      setFullSummary(result)
    } catch (err) {
      console.error("Failed to generate full summary:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Không thể khởi tạo bản tóm tắt toàn bộ tài liệu."
      )
    } finally {
      setLoadingSummary(false)
    }
  }, [documentId, loadingSummary])

  const reprocessDocument = useCallback(async () => {
    if (!documentId) return
    try {
      setReprocessing(true)
      setError(null)
      const services = await getAppServices()
      await services.documentWorker.reprocessDocument(documentId)
      await services.documentWorker.processPendingJobs()
      await reloadDocument()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReprocessing(false)
    }
  }, [documentId, reloadDocument])

  const clearQaHistory = useCallback(() => {
    setQaHistory([])
    setQaResult(null)
    setQaContext(null)
  }, [])

  return {
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
    reloadDocument,
    reprocessDocument,
    reprocessing,
  }
}

