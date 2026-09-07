import React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { TaskCard } from "@/components/tasks/TaskCard"
import type { TaskItem } from "@/services/tasks"

// Mock useCalendar
vi.mock("@/hooks/useCalendar", () => ({
  useCalendar: vi.fn(() => ({
    events: [],
    providers: [{ id: "internal", name: "Lịch nội bộ", availability: { available: true } }],
    loading: false,
    error: null,
    scheduleTask: vi.fn(),
    cancelEvent: vi.fn(),
    checkEligibility: (task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">) => {
      if (task.status !== "confirmed") return { eligible: false, reason: "Chỉ confirmed" }
      if (task.deadlineType !== "exact") return { eligible: false, reason: "Hạn chót tương đối/không rõ" }
      return { eligible: true }
    },
    getEventForTask: vi.fn(),
    reload: vi.fn(),
  })),
}))

// Mock useReminders
vi.mock("@/hooks/useReminders", () => ({
  useReminders: vi.fn(({ taskId }: { taskId: string }) => {
    if (taskId === "task-with-reminders") {
      return {
        reminders: [
          {
            id: "rem-1",
            taskId: "task-with-reminders",
            documentId: "doc-1",
            provider: "windows_toast",
            reminderType: "1_day_before",
            scheduledAt: "2026-10-19T09:00:00.000Z",
            status: "pending",
            idempotencyKey: "task-with-reminders:1_day_before",
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "rem-2",
            taskId: "task-with-reminders",
            documentId: "doc-1",
            provider: "windows_toast",
            reminderType: "at_deadline",
            scheduledAt: "2026-10-20T09:00:00.000Z",
            status: "delivered",
            idempotencyKey: "task-with-reminders:at_deadline",
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        providerAvailability: { available: true },
        loading: false,
        error: null,
        configureReminders: vi.fn(),
        cancelReminders: vi.fn(),
        reload: vi.fn(),
      }
    }

    return {
      reminders: [],
      providerAvailability: { available: true },
      loading: false,
      error: null,
      configureReminders: vi.fn(),
      cancelReminders: vi.fn(),
      reload: vi.fn(),
    }
  }),
}))

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-test-ui",
    documentId: "doc-1",
    title: "Nộp hồ sơ bảo hiểm",
    status: "confirmed",
    deadlineType: "exact",
    deadlineDate: "2026-10-20",
    semanticStatus: "VERIFIED",
    evidence: null,
    analysisId: null,
    analysisVersion: null,
    confidence: 0.95,
    userEdited: 0,
    rawDeadline: "20/10/2026",
    confirmedAt: new Date().toISOString(),
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("Reminder UI Integration in TaskCard", () => {
  it("renders reminder checkboxes on confirmed task with exact deadline", () => {
    const task = makeTask()
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Nhắc nhở thông báo (Windows Toast)")
    expect(html).toContain("Trước 1 ngày")
    expect(html).toContain("Trước 1 giờ")
    expect(html).toContain("Đúng hạn")
  })

  it("renders active reminders with scheduled and delivered badges", () => {
    const task = makeTask({ id: "task-with-reminders" })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("1 ngày: Đã lên lịch")
    expect(html).toContain("Đúng hạn: Đã gửi")
  })

  it("does not render reminder controls on pending tasks", () => {
    const task = makeTask({ status: "pending", confirmedAt: null })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).not.toContain("Nhắc nhở thông báo (Windows Toast)")
    expect(html).toContain("Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo")
  })

  it("does not render reminder controls on relative deadline tasks", () => {
    const task = makeTask({
      deadlineType: "relative",
      rawDeadline: "trong 7 ngày",
      deadlineDate: null,
    })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).not.toContain("Nhắc nhở thông báo (Windows Toast)")
    expect(html).toContain("Chưa thể thêm vào lịch")
  })
})
