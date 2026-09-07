import { describe, it, expect } from "vitest"
import { CalendarService } from "@/services/calendar/calendarService"
import type { TaskRepository } from "@/repositories/taskRepository"

describe("Calendar Eligibility Rules", () => {
  // Mock TaskRepository since validateTaskEligibility is a domain policy function
  const dummyTaskRepo = {} as TaskRepository
  const calendarService = new CalendarService(dummyTaskRepo)

  it("marks confirmed task with exact, valid deadline date as eligible", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
    })

    expect(result.eligible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("rejects pending tasks with clear reason", () => {
    const result = calendarService.validateTaskEligibility({
      status: "pending",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Chỉ công việc đã được xác nhận (confirmed) mới có thể tạo lịch")
  })

  it("rejects rejected tasks", () => {
    const result = calendarService.validateTaskEligibility({
      status: "rejected",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Chỉ công việc đã được xác nhận")
  })

  it("rejects completed or cancelled tasks", () => {
    const completedResult = calendarService.validateTaskEligibility({
      status: "completed",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
    })
    expect(completedResult.eligible).toBe(false)

    const cancelledResult = calendarService.validateTaskEligibility({
      status: "cancelled",
      deadlineType: "exact",
      deadlineDate: "2026-09-30",
    })
    expect(cancelledResult.eligible).toBe(false)
  })

  it("rejects relative deadlines and explains why resolution is needed", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "relative",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Hạn chót tương đối (relative) chưa được quy đổi thành ngày cụ thể")
  })

  it("rejects ambiguous deadlines without guessing", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "ambiguous",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Hạn chót không rõ ràng (ambiguous)")
  })

  it("rejects tasks with no deadline", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "none",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("deadlineType: none")
  })

  it("rejects tasks missing deadlineDate even if deadlineType is exact", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Thiếu ngày hạn chót hợp lệ")
  })

  it("rejects invalid date string", () => {
    const result = calendarService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: "not-a-valid-date",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("không đúng định dạng ngày hợp lệ")
  })
})
