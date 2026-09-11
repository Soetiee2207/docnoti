import { describe, it, expect } from "vitest";
import { AnalysisService } from "@/services/ai/analysisService";
import { DEFAULT_SUMMARY_TOKEN_BUDGET } from "@/services/ai/context";
import type { DocumentPageRecord } from "@/db/schema";

describe("Layered No-Blind-Spot Summary Page Budgeting", () => {
  const service = new AnalysisService({
    aiProvider: {
      id: "mock",
      metadata: { providerId: "mock", modelId: "mock", displayName: "Mock", isLocal: true },
      isAvailable: async () => ({ available: true }),
      analyze: async () => ({} as any),
    },
  });

  it("preserves 100% of pages when total characters fit within budget (e.g. TC-14 normal text)", () => {
    const pages: DocumentPageRecord[] = Array.from({ length: 18 }, (_, i) => ({
      id: `p-${i + 1}`,
      documentId: "doc-18",
      pageNumber: i + 1,
      textContent: `QUY CHE QUAN TRI NOI BO - CHUONG ${i + 1}. Noi dung dieu khoan trang ${i + 1}.`,
      pageHash: `h-${i + 1}`,
      ocrApplied: 0,
      createdAt: new Date().toISOString(),
    }));

    const result = service.prepareBudgetedSummaryPages(pages, DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters);
    expect(result.isSampled).toBe(false);
    expect(result.selectedPages.length).toBe(18);
    expect(result.selectedPages.some((p) => p.pageNumber === 18)).toBe(true);
  });

  it("selects page 18 when 18 dense pages exceed the budget limit", () => {
    // 18 pages * 2,000 chars = 36,000 chars > 22,400 chars
    const pages: DocumentPageRecord[] = Array.from({ length: 18 }, (_, i) => ({
      id: `p-${i + 1}`,
      documentId: "doc-18-dense",
      pageNumber: i + 1,
      textContent: (i === 17
        ? "QUY CHE QUAN TRI NOI BO - CHUONG 18. Nhiem vu cuoi: Toan the can bo nop ban cam ket tuan thu truoc ngay 05/12/2026. "
        : `QUY CHE QUAN TRI NOI BO - CHUONG ${i + 1}. Cac phong ban nghiem tuc thuc hien quy che. `
      ).repeat(25),
      pageHash: `h-${i + 1}`,
      ocrApplied: 0,
      createdAt: new Date().toISOString(),
    }));

    const result = service.prepareBudgetedSummaryPages(pages, DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters);
    expect(result.isSampled).toBe(true);
    // Page 18 (final concluding page) MUST be selected
    expect(result.selectedPages.some((p) => p.pageNumber === 18)).toBe(true);
    // Front pages must be selected
    expect(result.selectedPages.some((p) => p.pageNumber === 1)).toBe(true);
    // Total chars must strictly respect maxCharacters
    const totalChars = result.selectedPages.reduce((acc, p) => acc + p.textContent.length, 0);
    expect(totalChars).toBeLessThanOrEqual(DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters);
  });

  it("covers 210-page document without blind spots and captures middle milestone page (TC-16 page 105)", () => {
    const pages: DocumentPageRecord[] = Array.from({ length: 210 }, (_, i) => {
      const pageNum = i + 1;
      let content = `Giao trinh He thong Thong tin Doanh nghiep trang ${pageNum}. Noi dung bai giang chuong trinh dao tao. `.repeat(15);
      if (pageNum === 105) {
        content = "Giao trinh He thong Thong tin Doanh nghiep trang 105. Moc quan trong: Sinh vien phai nop de tai tieu luan giua ky truoc ngay 10/11/2026 qua he thong online. ".repeat(10);
      }
      return {
        id: `p-${pageNum}`,
        documentId: "doc-210",
        pageNumber: pageNum,
        textContent: content,
        pageHash: `h-${pageNum}`,
        ocrApplied: 0,
        createdAt: new Date().toISOString(),
      };
    });

    const result = service.prepareBudgetedSummaryPages(pages, DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters);
    expect(result.isSampled).toBe(true);

    const selectedNumbers = result.selectedPages.map((p) => p.pageNumber);
    console.log('SELECTED NUMBERS:', selectedNumbers);
    // Page 105 (high-signal milestone in middle of 210 pages) must be selected
    expect(selectedNumbers).toContain(105);

    // Front and back anchors must be present
    expect(selectedNumbers).toContain(1);
    expect(selectedNumbers).toContain(210);

    // Check that there is no blind spot gap larger than 30 pages across the entire document
    for (let i = 0; i < selectedNumbers.length - 1; i++) {
      const gap = selectedNumbers[i + 1]! - selectedNumbers[i]!;
      expect(gap).toBeLessThanOrEqual(30);
    }

    const totalChars = result.selectedPages.reduce((acc, p) => acc + p.textContent.length, 0);
    expect(totalChars).toBeLessThanOrEqual(DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters);
  });
});
