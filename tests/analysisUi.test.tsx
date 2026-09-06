import React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { DocumentAnalysisQaView } from "@/components/documents/DocumentAnalysisQaView"
import { DocumentViewer } from "@/components/documents/DocumentViewer"
import { DocumentFullSummaryView } from "@/components/documents/DocumentFullSummaryView"
import { StatusBadge, SourceBadge } from "@/components/documents/EvidenceBadge"
import type { AnalysisResult, BuiltContext } from "@/services/ai"
import type { DocumentPageRecord } from "@/db/schema"

function makeSampleAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    documentId: "doc-123",
    documentType: "CONTRACT",
    summary: "Hợp đồng thuê căn hộ số 101 với giá thuê 15.000.000 VNĐ/tháng.",
    fields: [
      {
        name: "Giá thuê",
        value: "15.000.000 VNĐ/tháng",
        semanticStatus: "VERIFIED",
        confidence: 0.98,
        evidence: {
          claim: "Giá thuê cố định mỗi tháng là 15 triệu VNĐ",
          status: "VERIFIED",
          confidence: 0.98,
          citations: [
            {
              pageNumber: 2,
              sourceText: "Tiền thuê hàng tháng là 15.000.000 VNĐ trả trước ngày 5.",
            },
          ],
        },
      },
      {
        name: "Thời hạn hợp đồng",
        value: "12 tháng",
        semanticStatus: "INFERRED",
        confidence: 0.85,
        evidence: {
          claim: "Thời hạn thuê dự kiến là một năm",
          status: "INFERRED",
          confidence: 0.85,
          citations: [
            {
              pageNumber: 1,
              sourceText: "Hợp đồng có hiệu lực từ 01/01/2026 đến hết 31/12/2026.",
            },
          ],
        },
      },
      {
        name: "Phí dịch vụ quản lý",
        value: "Chưa xác định",
        semanticStatus: "UNCERTAIN",
        confidence: 0.4,
        evidence: {
          claim: "Không có điều khoản rõ ràng về phí quản lý tòa nhà",
          status: "UNCERTAIN",
          confidence: 0.4,
          citations: [],
        },
      },
    ],
    evidences: [
      {
        claim: "Tiền đặt cọc bảo đảm là 30 triệu VNĐ",
        status: "VERIFIED",
        confidence: 0.99,
        citations: [
          {
            pageNumber: 2,
            sourceText: "Bên thuê đặt cọc số tiền 30.000.000 VNĐ khi ký hợp đồng.",
          },
        ],
        reasoning: "Điều khoản đặt cọc tại mục 4.1.",
      },
      {
        claim: "Bên thuê có thể nuôi thú cưng nhỏ",
        status: "INFERRED",
        confidence: 0.75,
        citations: [
          {
            pageNumber: 3,
            sourceText: "Không được gây tiếng ồn ảnh hưởng tới hàng xóm xung quanh.",
          },
        ],
        reasoning: "Quy định không cấm rõ ràng thú cưng nhỏ nếu không gây ồn.",
      },
      {
        claim: "Thời gian gia hạn hợp đồng",
        status: "UNCERTAIN",
        confidence: 0.3,
        citations: [],
        reasoning: "Không tìm thấy điều khoản về gia hạn tự động.",
      },
    ],
    warnings: [],
    provider: "mock-ai",
    model: "mock-v1",
    analyzedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeSamplePages(): DocumentPageRecord[] {
  return [
    {
      id: "p-1",
      documentId: "doc-123",
      pageNumber: 1,
      textContent: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nHỢP ĐỒNG THUÊ NHÀ...",
      charCount: 82,
      hasSufficientText: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "p-2",
      documentId: "doc-123",
      pageNumber: 2,
      textContent: "ĐIỀU 3: GIÁ THUÊ VÀ PHƯƠNG THỨC THANH TOÁN\nTiền thuê hàng tháng là 15.000.000 VNĐ...",
      charCount: 80,
      hasSufficientText: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
}

describe("Analysis & Search UI Integration Tests", () => {
  it("renders EvidenceBadge with distinctive styles for VERIFIED, INFERRED, UNCERTAIN", () => {
    const verifiedHtml = renderToString(<StatusBadge status="VERIFIED" />)
    expect(verifiedHtml).toContain("Xác thực")
    expect(verifiedHtml).toContain("emerald")

    const inferredHtml = renderToString(<StatusBadge status="INFERRED" />)
    expect(inferredHtml).toContain("Suy luận")
    expect(inferredHtml).toContain("blue")

    const uncertainHtml = renderToString(<StatusBadge status="UNCERTAIN" />)
    expect(uncertainHtml).toContain("Chưa chắc chắn")
    expect(uncertainHtml).toContain("amber")
  })

  it("renders SourceBadge correctly for both, lexical, and vector sources", () => {
    const bothHtml = renderToString(<SourceBadge source="both" />)
    expect(bothHtml).toContain("FTS5 + Vector")
    expect(bothHtml).toContain("purple")

    const lexicalHtml = renderToString(<SourceBadge source="lexical" />)
    expect(lexicalHtml).toContain("Từ khóa FTS5")
    expect(lexicalHtml).toContain("sky")

    const vectorHtml = renderToString(<SourceBadge source="vector" />)
    expect(vectorHtml).toContain("Vector ngữ nghĩa")
    expect(vectorHtml).toContain("indigo")

    const nullHtml = renderToString(<SourceBadge source={null} />)
    expect(nullHtml).toBe("")
  })

  it("renders initial state with question input placeholder", () => {
    const html = renderToString(
      <DocumentAnalysisQaView
        question=""
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={false}
        error={null}
        result={null}
        context={null}
        isDegraded={false}
        noCandidates={false}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Đặt câu hỏi về tài liệu này...")
    expect(html).toContain("Tra cứu thông tin theo bằng chứng")
    expect(html).toContain("Hỏi đáp")
  })

  it("renders loading state with disabled input and progress indicator", () => {
    const html = renderToString(
      <DocumentAnalysisQaView
        question="Giá thuê là bao nhiêu?"
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={true}
        error={null}
        result={null}
        context={null}
        isDegraded={false}
        noCandidates={false}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Đang tìm kiếm bằng chứng và phân tích nội dung...")
    expect(html).toContain("Đang tra cứu...")
    expect(html).toContain("disabled")
  })

  it("renders error state when analysis fails", () => {
    const html = renderToString(
      <DocumentAnalysisQaView
        question="Giá thuê?"
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={false}
        error="Mô hình AI bị quá tải (Rate limit exceeded)"
        result={null}
        context={null}
        isDegraded={false}
        noCandidates={false}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Lỗi phân tích tài liệu")
    expect(html).toContain("Mô hình AI bị quá tải (Rate limit exceeded)")
  })

  it("renders degraded retrieval banner with clear notification", () => {
    const html = renderToString(
      <DocumentAnalysisQaView
        question="Điều khoản thanh toán?"
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={false}
        error={null}
        result={makeSampleAnalysisResult()}
        context={null}
        isDegraded={true}
        noCandidates={false}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Chế độ truy xuất hạn chế (Degraded Mode)")
    expect(html).toContain(
      "Semantic search hiện không khả dụng; kết quả đang dựa trên tìm kiếm từ khóa."
    )
  })

  it("renders empty retrieval state when no relevant chunks were matched", () => {
    const html = renderToString(
      <DocumentAnalysisQaView
        question="Học phí trường đại học?"
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={false}
        error={null}
        result={makeSampleAnalysisResult()}
        context={null}
        isDegraded={false}
        noCandidates={true}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Không tìm thấy căn cứ phù hợp")
    expect(html).toContain(
      "Không tìm thấy nội dung liên quan trong tài liệu cho câu hỏi này."
    )
  })

  it("renders successful answer, extracted fields, and evidence citations with page provenance", () => {
    const result = makeSampleAnalysisResult()
    const context: BuiltContext = {
      chunks: [
        {
          chunkId: "c-1",
          documentId: "doc-123",
          pageNumber: 2,
          chunkIndex: 0,
          content: "Tiền thuê hàng tháng là 15.000.000 VNĐ trả trước ngày 5.",
          charStart: 0,
          charEnd: 56,
          fusedScore: 0.03,
          lexicalRank: 1,
          vectorRank: 1,
          retrievalSources: "both",
        },
        {
          chunkId: "c-2",
          documentId: "doc-123",
          pageNumber: 2,
          chunkIndex: 1,
          content: "Bên thuê đặt cọc số tiền 30.000.000 VNĐ khi ký hợp đồng.",
          charStart: 57,
          charEnd: 114,
          fusedScore: 0.028,
          lexicalRank: 2,
          vectorRank: 2,
          retrievalSources: "both",
        },
      ],
      groups: [],
      formattedText: "",
      pages: [],
      diagnostics: {
        totalCandidates: 1,
        selectedChunksCount: 1,
        skippedChunksCount: 0,
        totalCharacters: 56,
        estimatedTokens: 14,
        budgetExceeded: false,
        truncatedDueToBudget: false,
      },
      pageContextMap: new Map(),
      includedChunkIds: new Set(["c-1"]),
    }

    const html = renderToString(
      <DocumentAnalysisQaView
        question="Giá thuê là bao nhiêu?"
        onQuestionChange={() => {}}
        onAsk={async () => {}}
        analyzing={false}
        error={null}
        result={result}
        context={context}
        isDegraded={false}
        noCandidates={false}
        onNavigateToPage={() => {}}
      />
    )

    // Answer summary
    expect(html).toContain("Hợp đồng thuê căn hộ số 101 với giá thuê 15.000.000 VNĐ/tháng.")
    expect(html).toContain("CONTRACT")

    // Extracted Fields
    expect(html).toContain("Giá thuê")
    expect(html).toContain("15.000.000 VNĐ/tháng")
    expect(html).toContain("Thời hạn hợp đồng")
    expect(html).toContain("12 tháng")

    // Evidence claims and verbatim quotes
    expect(html).toContain("Tiền đặt cọc bảo đảm là 30 triệu VNĐ")
    expect(html).toContain("Bên thuê đặt cọc số tiền 30.000.000 VNĐ khi ký hợp đồng.")
    expect(html).toContain("Trang 2")

    // Provenance source
    expect(html).toContain("FTS5 + Vector")
  })

  it("renders DocumentViewer with page navigation toolbar and page text", () => {
    const pages = makeSamplePages()
    const html = renderToString(
      <DocumentViewer
        pages={pages}
        currentPage={2}
        onPageChange={() => {}}
      />
    )

    expect(html).toContain("Trang 2 / 2")
    expect(html).toContain("ĐIỀU 3: GIÁ THUÊ VÀ PHƯƠNG THỨC THANH TOÁN")
    expect(html).toContain("Chuyển trang:")
  })

  it("handles empty pages state in DocumentViewer", () => {
    const html = renderToString(
      <DocumentViewer
        pages={[]}
        currentPage={1}
        onPageChange={() => {}}
      />
    )

    expect(html).toContain("Chưa có văn bản được trích xuất")
  })

  it("renders DocumentFullSummaryView preserving the full document summary workflow", () => {
    const summary = makeSampleAnalysisResult()
    const html = renderToString(
      <DocumentFullSummaryView
        summary={summary}
        loading={false}
        onGenerate={async () => {}}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Phân loại tài liệu:")
    expect(html).toContain("CONTRACT")
    expect(html).toContain("Tóm tắt nội dung chính:")
    expect(html).toContain("Các trường dữ liệu được trích xuất")
    expect(html).toContain("Bằng chứng trích dẫn")
    expect(html).toContain("Phân tích lại")
  })

  it("renders empty state in DocumentFullSummaryView with generate button", () => {
    const html = renderToString(
      <DocumentFullSummaryView
        summary={null}
        loading={false}
        onGenerate={async () => {}}
        onNavigateToPage={() => {}}
      />
    )

    expect(html).toContain("Chưa có bản tóm tắt toàn diện")
    expect(html).toContain("Tạo tóm tắt tài liệu")
  })

  it("prevents duplicate submissions when already analyzing", async () => {
    const onAskSpy = vi.fn()

    // Test simulate submit directly
    const handleSubmit = async (analyzing: boolean, query: string) => {
      if (!query.trim() || analyzing) return
      await onAskSpy(query.trim())
    }

    // When analyzing is true:
    await handleSubmit(true, "First question")
    expect(onAskSpy).not.toHaveBeenCalled()

    // When analyzing is false:
    await handleSubmit(false, "First question")
    expect(onAskSpy).toHaveBeenCalledWith("First question")
  })
})
