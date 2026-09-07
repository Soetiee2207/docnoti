import { describe, it, expect } from "vitest"
import { NotificationService } from "@/services/notification/notificationService"
import type { TaskRepository } from "@/repositories/taskRepository"
import type { ReminderRepository } from "@/repositories/reminderRepository"

describe("Reminder Eligibility Rules", () => {
  const dummyTaskRepo = {} as TaskRepository
  const dummyReminderRepo = {} as ReminderRepository
  const notificationService = new NotificationService(dummyTaskRepo, dummyReminderRepo)

  it("marks confirmed task with exact, valid deadline date as eligible", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
    })

    expect(result.eligible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("rejects pending tasks with clear explanation", () => {
    const result = notificationService.validateTaskEligibility({
      status: "pending",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Chỉ công việc đã được xác nhận (confirmed) mới có thể lên lịch nhắc nhở")
  })

  it("rejects rejected tasks", () => {
    const result = notificationService.validateTaskEligibility({
      status: "rejected",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Chỉ công việc đã được xác nhận")
  })

  it("rejects completed or cancelled tasks", () => {
    const completed = notificationService.validateTaskEligibility({
      status: "completed",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
    })
    expect(completed.eligible).toBe(false)

    const cancelled = notificationService.validateTaskEligibility({
      status: "cancelled",
      deadlineType: "exact",
      deadlineDate: "2026-10-15",
    })
    expect(cancelled.eligible).toBe(false)
  })

  it("rejects relative deadlines without silently resolving them", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "relative",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Hạn chót tương đối (relative) chưa được quy đổi thành ngày cụ thể")
  })

  it("rejects ambiguous deadlines without guessing", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "ambiguous",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Hạn chót không rõ ràng (ambiguous)")
  })

  it("rejects tasks with no deadline", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "none",
      deadlineDate: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("deadlineType: none")
  })

  it("rejects tasks missing deadlineDate even if deadlineType is exact", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: "",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Thiếu ngày hạn chót hợp lệ")
  })

  it("rejects invalid date string", () => {
    const result = notificationService.validateTaskEligibility({
      status: "confirmed",
      deadlineType: "exact",
      deadlineDate: "invalid-date",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("không đúng định dạng ngày hợp lệ")
  })
})
