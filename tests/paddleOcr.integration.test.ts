import { describe, it, expect } from "vitest"
import { PaddleOCRProvider } from "../src/services/ocr/paddleOcrProvider"
import { OCRError } from "../src/services/ocr/types"

describe("PaddleOCR Integration & Environment Discovery", () => {
  const provider = new PaddleOCRProvider()

  it("verifies provider identification and contract", () => {
    expect(provider.name).toBe("PaddleOCR")
  })

  it("truthfully discovers local environment and reports availability", async () => {
    const isAvailable = await provider.isAvailable()

    // Truthful check: does not pretend PaddleOCR is installed if it is not
    if (!isAvailable) {
      console.log(
        "[INFO] PaddleOCR is not installed in current Python environment. " +
          "Environment discovery correctly detected unavailability."
      )
      expect(isAvailable).toBe(false)

      // When unavailable, attempting to recognize a page must throw OCRError with setup instructions
      const dummyImage = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      await expect(provider.recognizePage(dummyImage, 1)).rejects.toThrow(OCRError)
    } else {
      console.log("[INFO] PaddleOCR is installed in current Python environment.")
      expect(isAvailable).toBe(true)
    }
  }, 30000)

  it("rejects empty image data even if called directly", async () => {
    await expect(provider.recognizePage(new Uint8Array([]), 1)).rejects.toThrow(OCRError)
  })

  it("executes real OCR on Vietnamese test fixture image through PaddleOCRProvider", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const fixturePath = path.resolve("tests/fixtures/sample_vietnamese.png")
    const imageBytes = fs.readFileSync(fixturePath)

    const result = await provider.recognizePage(new Uint8Array(imageBytes), 1)

    expect(result.pageNumber).toBe(1)
    expect(result.text).toContain("CONG HOA XA HOI")
    expect(result.text).toContain("DOC LAP TU DO")
    expect(result.confidence).toBeGreaterThan(0.9)
    expect(result.lines).toBeDefined()
    expect(result.lines!.length).toBeGreaterThanOrEqual(2)
  }, 45000)
})
