import { describe, it, expect } from "vitest"
import { renderToString } from "react-dom/server"
import { DocumentFullSummaryView } from "@/components/documents/DocumentFullSummaryView"
import { DocumentAnalysisQaView } from "@/components/documents/DocumentAnalysisQaView"
import type { AnalysisResult } from "@/services/ai"

function makeMockAnalysisResult(): AnalysisResult {
  return {
    documentId: "doc-1",
    documentType: "REPORT",
    summary: "Bản tóm tắt tổng quan cho tài liệu mẫu gồm 2 trang.",
    answer: "Bản tóm tắt tổng quan cho tài liệu mẫu gồm 2 trang.",
    confidence: "INFERRED",
    fields: [
      {
        name: "title",
        value: "tai_lieu_mau.pdf",
        semanticStatus: "INFERRED",
        confidence: 0.95,
        evidence: {
          claim: "Document title derived from file name",
          status: "INFERRED",
          confidence: 0.95,
          citations: [{ pageNumber: 1, sourceText: "Sample text excerpt" }],
        },
      },
    ],
    tasks: [],
    evidences: [],
    warnings: [],
    provider: "mock-ai-provider",
    model: "mock-doc-v1",
    analyzedAt: new Date().toISOString(),
  }
}

function makeRealOpenAiAnalysisResult(): AnalysisResult {
  return {
    documentId: "doc-1",
    documentType: "OFFICIAL_DOCUMENT",
    summary: "Nghị quyết ban hành kế hoạch công tác quý IV năm 2026.",
    answer: "Nghị quyết ban hành kế hoạch công tác quý IV năm 2026.",
    confidence: "VERIFIED",
    fields: [
      {
        name: "so_hieu",
        value: "123/NQ-UBND",
        semanticStatus: "VERIFIED",
        confidence: 0.99,
        evidence: {
          claim: "Số hiệu văn bản 123/NQ-UBND",
          status: "VERIFIED",
          confidence: 0.99,
          citations: [{ pageNumber: 1, sourceText: "Số: 123/NQ-UBND" }],
        },
      },
    ],
    tasks: [
      {
        title: "Hoàn tất báo cáo",
        deadline: "2026-10-15",
        deadlineType: "exact",
        semanticStatus: "VERIFIED",
        confidence: 0.95,
      },
    ],
    evidences: [],
    warnings: [],
    provider: "openai",
    model: "gpt-4o-mini",
    analyzedAt: new Date().toISOString(),
  }
}

describe("AI Configuration & Production UX Guardrails", () => {
  describe("DocumentFullSummaryView UX", () => {
    it("renders clear warning when Cloud AI is not configured before generating summary", () => {
      const html = renderToString(
        <DocumentFullSummaryView
          summary={null}
          loading={false}
          onGenerate={async () => {}}
          onNavigateToPage={() => {}}
          isCloudAiReady={false}
        />
      )

      expect(html).toContain("Chưa có bản tóm tắt toàn diện")
      expect(html).toContain("Chưa kích hoạt Cloud AI (OpenAI)")
      expect(html).toContain("hệ thống sẽ sử dụng dữ liệu mẫu từ Mock AI Provider")
      expect(html).toContain("Cài đặt")
    })

    it("renders prominent Mock AI advisory banner and badges when summary is from MockAIProvider", () => {
      const mockSummary = makeMockAnalysisResult()
      const html = renderToString(
        <DocumentFullSummaryView
          summary={mockSummary}
          loading={false}
          onGenerate={async () => {}}
          onNavigateToPage={() => {}}
          isCloudAiReady={false}
        />
      )

      // Warning banner present
      expect(html).toContain("Bản tóm tắt từ Mô hình Mô phỏng (Mock AI Provider)")
      expect(html).toContain("Chưa bật Cloud AI")
      expect(html).toContain("dữ liệu mẫu minh họa")
      expect(html).toContain("không phản ánh nội dung thực tế do AI suy luận")

      // Badges
      expect(html).toContain("Mô phỏng (Mock AI)")
      expect(html).toContain("(Nội dung mô phỏng)")
      expect(html).toContain("(Dữ liệu mẫu)")
    })

    it("does NOT render mock warning banner when summary is from real OpenAIProvider", () => {
      const realSummary = makeRealOpenAiAnalysisResult()
      const html = renderToString(
        <DocumentFullSummaryView
          summary={realSummary}
          loading={false}
          onGenerate={async () => {}}
          onNavigateToPage={() => {}}
          isCloudAiReady={true}
        />
      )

      expect(html).not.toContain("Bản tóm tắt từ Mô hình Mô phỏng (Mock AI Provider)")
      expect(html).not.toContain("Mô phỏng (Mock AI)")
      expect(html).not.toContain("dữ liệu mẫu minh họa")
      expect(html).toContain("OFFICIAL_DOCUMENT")
      expect(html).toContain("Nghị quyết ban hành kế hoạch công tác")
    })
  })

  describe("DocumentAnalysisQaView UX", () => {
    it("renders pre-question callout when Cloud AI is not ready", () => {
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
          isCloudAiReady={false}
        />
      )

      expect(html).toContain("Cloud AI chưa được cấu hình. Hỏi đáp đang hoạt động ở chế độ mô phỏng (Mock AI)")
      expect(html).toContain("Cài đặt")
    })

    it("renders Mock AI warning box when answering via MockAIProvider", () => {
      const mockResult = makeMockAnalysisResult()
      const html = renderToString(
        <DocumentAnalysisQaView
          question="Nội dung chính?"
          onQuestionChange={() => {}}
          onAsk={async () => {}}
          analyzing={false}
          error={null}
          result={mockResult}
          context={null}
          isDegraded={false}
          noCandidates={false}
          onNavigateToPage={() => {}}
          isCloudAiReady={false}
        />
      )

      expect(html).toContain("Câu trả lời từ Mô hình Mô phỏng (Mock AI Provider)")
      expect(html).toContain("Mô phỏng (Mock AI)")
      expect(html).toContain("Ứng dụng chưa kích hoạt Cloud AI hoặc chưa lưu OpenAI API Key")
    })

    it("does NOT render mock warning when answering via real OpenAIProvider with Cloud AI enabled", () => {
      const realResult = makeRealOpenAiAnalysisResult()
      const html = renderToString(
        <DocumentAnalysisQaView
          question="Số hiệu văn bản là gì?"
          onQuestionChange={() => {}}
          onAsk={async () => {}}
          analyzing={false}
          error={null}
          result={realResult}
          context={null}
          isDegraded={false}
          noCandidates={false}
          onNavigateToPage={() => {}}
          isCloudAiReady={true}
        />
      )

      expect(html).not.toContain("Câu trả lời từ Mô hình Mô phỏng")
      expect(html).not.toContain("Mô phỏng (Mock AI)")
      expect(html).not.toContain("bộ sinh mẫu")
      expect(html).toContain("Nghị quyết ban hành kế hoạch công tác")
    })
  })
})
