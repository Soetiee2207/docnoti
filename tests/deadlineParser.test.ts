import { describe, it, expect } from "vitest"
import { parseDeadline } from "@/services/tasks/deadlineParser"

describe("DeadlineParser Engine Tests", () => {
  describe("Exact Absolute Deadlines", () => {
    it("parses DD/MM/YYYY format and normalizes to ISO YYYY-MM-DD", () => {
      const res = parseDeadline("Hạn thanh toán trước ngày 30/09/2026.")
      expect(res.type).toBe("exact")
      expect(res.normalizedDate).toBe("2026-09-30")
      expect(res.raw).toBe("30/09/2026")
    })

    it("parses DD-MM-YYYY format", () => {
      const res = parseDeadline("Nộp hồ sơ trước 15-10-2026")
      expect(res.type).toBe("exact")
      expect(res.normalizedDate).toBe("2026-10-15")
    })

    it("parses ISO YYYY-MM-DD format", () => {
      const res = parseDeadline("Due date: 2026-12-31")
      expect(res.type).toBe("exact")
      expect(res.normalizedDate).toBe("2026-12-31")
    })

    it("parses Vietnamese textual format 'ngày DD tháng MM năm YYYY'", () => {
      const res = parseDeadline("Hợp đồng có hiệu lực đến ngày 5 tháng 8 năm 2027.")
      expect(res.type).toBe("exact")
      expect(res.normalizedDate).toBe("2027-08-05")
    })

    it("rejects invalid dates (e.g. month > 12 or day > 31)", () => {
      const res = parseDeadline("Ngày 32/13/2026")
      expect(res.type).not.toBe("exact")
    })
  })

  describe("Relative Deadlines (Preserved without invented calendar dates)", () => {
    it("parses 'trong 7 ngày' as relative and does NOT invent a calendar date", () => {
      const res = parseDeadline("hoàn thành trong 7 ngày kể từ ngày nhận thông báo")
      expect(res.type).toBe("relative")
      expect(res.raw).toContain("trong 7 ngày")
      expect(res.normalizedDate).toBeNull()
    })

    it("parses 'trong vòng 30 ngày'", () => {
      const res = parseDeadline("Thanh toán tiền đặt cọc trong vòng 30 ngày")
      expect(res.type).toBe("relative")
      expect(res.raw).toContain("trong vòng 30 ngày")
      expect(res.normalizedDate).toBeNull()
    })

    it("parses 'sau 10 ngày kể từ ngày ký'", () => {
      const res = parseDeadline("Bàn giao mặt bằng sau 10 ngày kể từ ngày ký.")
      expect(res.type).toBe("relative")
      expect(res.normalizedDate).toBeNull()
    })

    it("parses English relative expressions like 'within 14 days'", () => {
      const res = parseDeadline("Submit payment within 14 days")
      expect(res.type).toBe("relative")
      expect(res.normalizedDate).toBeNull()
    })
  })

  describe("Ambiguous / Vague Deadlines (Preserved without invented specific days)", () => {
    it("parses 'trong tháng này' as ambiguous without fabricating a day", () => {
      const res = parseDeadline("Nộp báo cáo tài chính trong tháng này")
      expect(res.type).toBe("ambiguous")
      expect(res.raw).toBe("trong tháng này")
      expect(res.normalizedDate).toBeNull()
    })

    it("parses 'cuối tháng'", () => {
      const res = parseDeadline("Quyết toán công nợ cuối tháng")
      expect(res.type).toBe("ambiguous")
      expect(res.raw).toBe("cuối tháng")
      expect(res.normalizedDate).toBeNull()
    })

    it("parses 'sớm nhất có thể'", () => {
      const res = parseDeadline("Phản hồi thông tin sớm nhất có thể")
      expect(res.type).toBe("ambiguous")
      expect(res.normalizedDate).toBeNull()
    })
  })

  describe("Non-temporal / None", () => {
    it("returns none for text without deadline or time expressions", () => {
      const res = parseDeadline("Hợp đồng thuê nhà căn hộ số 101 tòa nhà Sunshine")
      expect(res.type).toBe("none")
      expect(res.raw).toBeNull()
      expect(res.normalizedDate).toBeNull()
    })

    it("handles null, undefined, or empty string safely", () => {
      expect(parseDeadline(null).type).toBe("none")
      expect(parseDeadline(undefined).type).toBe("none")
      expect(parseDeadline("").type).toBe("none")
    })
  })
})
