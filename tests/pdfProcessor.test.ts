import { describe, it, expect } from "vitest"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"
import { PDFProcessingError } from "@/services/pdf/types"
import {
  createValidTextPdf,
  createMultiPageTextPdf,
  createEmptyScannedPdf,
  createCorruptedPdf,
} from "./fixtures/samplePdfs"

describe("PDF Processor (PDF.js) Tests", () => {
  const processor = new PdfJsProcessor({ minCharsPerPage: 20 })

  it("extracts text and metadata from valid single-page PDF", async () => {
    const pdfData = createValidTextPdf()
    const result = await processor.process(pdfData)

    expect(result.metadata.pageCount).toBe(1)
    expect(result.pages.length).toBe(1)
    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].text).toContain("Doc lap Tu do Hanh phuc")
    expect(result.pages[0].charCount).toBeGreaterThan(30)
    expect(result.pages[0].hasSufficientText).toBe(true)
    expect(result.isSufficientText).toBe(true)
    expect(result.needsOcr).toBe(false)
  })

  it("extracts text accurately across multiple pages with stable 1-based page numbering", async () => {
    const pdfData = createMultiPageTextPdf()
    const result = await processor.process(pdfData)

    expect(result.metadata.pageCount).toBe(3)
    expect(result.pages.length).toBe(3)

    // Page 1
    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].text).toContain("Trang mot")
    expect(result.pages[0].hasSufficientText).toBe(true)

    // Page 2
    expect(result.pages[1].pageNumber).toBe(2)
    expect(result.pages[1].text).toContain("Trang hai")
    expect(result.pages[1].hasSufficientText).toBe(true)

    // Page 3
    expect(result.pages[2].pageNumber).toBe(3)
    expect(result.pages[2].text).toContain("Trang ba")
    expect(result.pages[2].hasSufficientText).toBe(true)

    expect(result.totalCharacters).toBeGreaterThan(100)
    expect(result.isSufficientText).toBe(true)
    expect(result.needsOcr).toBe(false)
  })

  it("identifies scanned / empty PDF and flags needsOcr = true without failing", async () => {
    const pdfData = createEmptyScannedPdf()
    const result = await processor.process(pdfData)

    expect(result.metadata.pageCount).toBe(1)
    expect(result.pages.length).toBe(1)
    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].charCount).toBe(0)
    expect(result.pages[0].hasSufficientText).toBe(false)
    expect(result.isSufficientText).toBe(false)
    expect(result.needsOcr).toBe(true)
  })

  it("throws PDFProcessingError on corrupted bytes", async () => {
    const corrupted = createCorruptedPdf()
    await expect(processor.process(corrupted)).rejects.toThrow(PDFProcessingError)
  })

  it("throws PDFProcessingError on empty byte array", async () => {
    await expect(processor.process(new Uint8Array([]))).rejects.toThrow(PDFProcessingError)
  })
})
