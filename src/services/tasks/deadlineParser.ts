import type { ParsedDeadline } from "./types"

/**
 * Validates day, month, and year and returns padded ISO date string (YYYY-MM-DD) or null if invalid.
 */
function toIsoDate(day: number, month: number, year: number): string | null {
  if (year < 1900 || year > 2100) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null

  // Check valid days in month
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) return null

  const dd = String(day).padStart(2, "0")
  const mm = String(month).padStart(2, "0")
  const yyyy = String(year)
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Pure deterministic parser that extracts deadline and temporal expressions from text.
 * Strictly adheres to the rule: Never fabricate an exact date or time when only relative or ambiguous
 * text is available.
 */
export function parseDeadline(text: string | null | undefined): ParsedDeadline {
  if (!text || typeof text !== "string") {
    return { type: "none", raw: null, normalizedDate: null }
  }

  const clean = text.trim()
  if (!clean) {
    return { type: "none", raw: null, normalizedDate: null }
  }

  // 1. Try to find explicit exact dates
  // Pattern A: "ngày DD tháng MM năm YYYY"
  const vnTextDateRegex = /(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i
  const vnMatch = clean.match(vnTextDateRegex)
  if (vnMatch && vnMatch[1] && vnMatch[2] && vnMatch[3]) {
    const day = parseInt(vnMatch[1], 10)
    const month = parseInt(vnMatch[2], 10)
    const year = parseInt(vnMatch[3], 10)
    const iso = toIsoDate(day, month, year)
    if (iso) {
      return {
        type: "exact",
        raw: vnMatch[0],
        normalizedDate: iso,
      }
    }
  }

  // Pattern B: "YYYY-MM-DD" or "YYYY/MM/DD"
  const isoRegex = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/
  const isoMatch = clean.match(isoRegex)
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10)
    const day = parseInt(isoMatch[3], 10)
    const iso = toIsoDate(day, month, year)
    if (iso) {
      return {
        type: "exact",
        raw: isoMatch[0],
        normalizedDate: iso,
      }
    }
  }

  // Pattern C: "DD/MM/YYYY" or "DD-MM-YYYY" or "DD.MM.YYYY" (common in VN/EU)
  const dmyRegex = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/
  const dmyMatch = clean.match(dmyRegex)
  if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10)
    const year = parseInt(dmyMatch[3], 10)
    const iso = toIsoDate(day, month, year)
    if (iso) {
      return {
        type: "exact",
        raw: dmyMatch[0],
        normalizedDate: iso,
      }
    }
  }

  // 2. Check for Relative Deadline patterns (do not fabricate a calendar date)
  const relativePatterns = [
    /trong\s+(?:vòng\s+)?\d+\s*(?:ngày|ngay|tuần|tuan|tháng|thang|năm|nam|giờ|gio)\b/i,
    /sau\s+\d+\s*(?:ngày|ngay|tuần|tuan|tháng|thang|năm|nam)\s*(?:kể từ|ke tu)?/i,
    /\b\d+\s*(?:ngày|tuần|tháng|năm)\s+kể từ\b/i,
    /\b(?:within|in)\s+\d+\s*(?:days?|weeks?|months?|hours?|years?)\b/i,
    /\b\d+\s*(?:days?|weeks?|months?|hours?)\s+from\b/i,
    /thời hạn\s+\d+\s*(?:ngày|tháng|năm)/i,
    /hạn\s+\d+\s*(?:ngày|tháng)/i,
  ]

  for (const pattern of relativePatterns) {
    const relMatch = clean.match(pattern)
    if (relMatch) {
      return {
        type: "relative",
        raw: relMatch[0].trim(),
        normalizedDate: null,
      }
    }
  }

  // 3. Check for Ambiguous / Vague temporal statements (do not fabricate a specific day)
  const ambiguousPatterns = [
    /(?:trong|vào|cuối|đầu|giữa)\s+(?:tháng này|tháng sau|tháng tới|quý này|quý sau|quý tới|năm nay|năm sau|năm tới|tuần này|tuần sau|tuần tới)/i,
    /cuối\s+(?:tháng|quý|năm|tuần)/i,
    /đầu\s+(?:tháng|quý|năm|tuần)/i,
    /giữa\s+(?:tháng|quý|năm|tuần)/i,
    /sớm nhất có thể|càng sớm càng tốt|asap/i,
    /định kỳ\s+(?:hàng|mỗi)\s*(?:tháng|quý|năm)/i,
    /khi có (?:thông báo|yêu cầu)/i,
    /(?:end of|beginning of)\s+(?:this|next)\s+(?:month|week|quarter|year)/i,
    /as soon as possible/i,
  ]

  for (const pattern of ambiguousPatterns) {
    const ambMatch = clean.match(pattern)
    if (ambMatch) {
      return {
        type: "ambiguous",
        raw: ambMatch[0].trim(),
        normalizedDate: null,
      }
    }
  }

  return {
    type: "none",
    raw: null,
    normalizedDate: null,
  }
}
