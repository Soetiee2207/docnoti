/**
 * Helper to build valid, lightweight, self-contained PDF test fixtures.
 * Zero external files, zero user data.
 */
export function buildPdfBuffer(pages: string[]): Uint8Array {
  const objects: string[] = []

  // 1: Catalog
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj")

  // 2: Pages container
  const pageRefs = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >> endobj`)

  const fontObjId = 3 + pages.length * 2
  let currentObj = 3

  for (let i = 0; i < pages.length; i++) {
    const pageObjId = currentObj
    const contentObjId = currentObj + 1
    const text = pages[i]
    // PDF text stream (BT ... ET)
    const stream =
      text.length > 0
        ? `BT /F1 12 Tf 50 700 Td (${text.replace(/[()]/g, "")}) Tj ET`
        : ""

    objects.push(
      `${pageObjId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentObjId} 0 R >> endobj`
    )
    objects.push(
      `${contentObjId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
    )
    currentObj += 2
  }

  // Font object
  objects.push(`${fontObjId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`)

  const header = "%PDF-1.4\n"
  const body = objects.join("\n") + "\n"
  const xrefOffset = header.length + body.length
  const xref = `xref\n0 ${fontObjId + 1}\n0000000000 65535 f \n`
  const trailer = `trailer << /Size ${fontObjId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  const fullPdf = header + body + xref + trailer
  return new Uint8Array(Buffer.from(fullPdf, "utf-8"))
}

export function createValidTextPdf(): Uint8Array {
  return buildPdfBuffer([
    "Cong hoa xa hoi chu nghia Viet Nam. Doc lap Tu do Hanh phuc. Quyet dinh ve viec ban hanh ke hoach cong tac nam 2026.",
  ])
}

export function createMultiPageTextPdf(): Uint8Array {
  return buildPdfBuffer([
    "Trang mot: Thong tin chung ve du an docnoti va cac yeu cau nghiep vu can thiet.",
    "Trang hai: Ke hoach trien khai chi tiet tung giai doan va thoi han nop bao cao nghiem thu.",
    "Trang ba: Danh sach nhan su chiu trach nhiem va phuong an xu ly rui ro.",
  ])
}

export function createEmptyScannedPdf(): Uint8Array {
  // Page exists but has no text layer (scanned or image-only simulation)
  return buildPdfBuffer([""])
}

export function createMultiPageScannedPdf(): Uint8Array {
  return buildPdfBuffer(["", "", ""])
}

export function createMixedPdf(): Uint8Array {
  return buildPdfBuffer([
    "Trang mot co day du noi dung van ban hop dong da duoc so hoa.",
    "", // Trang hai la ban scan con dau, khong co text layer
  ])
}

export function createCorruptedPdf(): Uint8Array {
  return new Uint8Array(Buffer.from("This is definitely not a valid PDF content header", "utf-8"))
}

