import React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { TaskCard } from "@/components/tasks/TaskCard"
import type { TaskItem } from "@/services/tasks"

// Mock useCalendar to return predictable state for UI rendering tests
vi.mock("@/hooks/useCalendar", () => ({
  useCalendar: vi.fn(({ taskId }: { taskId: string }) => {
    if (taskId === "task-scheduled") {
      return {
        events: [
          {
            id: "cal-event-1",
            taskId: "task-scheduled",
            documentId: "doc-1",
            provider: "internal",
            title: "Nhiệm vụ đã lên lịch",
            startDate: "2026-09-30",
            endDate: "2026-09-30",
            isAllDay: true,
            timezone: "Asia/Ho_Chi_Minh",
            status: "scheduled",
            idempotencyKey: "task-scheduled:internal",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        providers: [{ id: "internal", name: "Lịch nội bộ", availability: { available: true } }],
        loading: false,
        error: null,
        scheduleTask: vi.fn(),
        cancelEvent: vi.fn(),
        checkEligibility: (task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">) => {
          if (task.status !== "confirmed") return { eligible: false, reason: "Chỉ công việc confirmed" }
          if (task.deadlineType !== "exact") return { eligible: false, reason: "Hạn chót tương đối/không rõ" }
          return { eligible: true }
        },
        getEventForTask: vi.fn(),
        reload: vi.fn(),
      }
    }

    return {
      events: [],
      providers: [
        { id: "internal", name: "Lịch nội bộ", availability: { available: true } },
        { id: "windows", name: "Windows Calendar", availability: { available: true } },
      ],
      loading: false,
      error: null,
      scheduleTask: vi.fn(),
      cancelEvent: vi.fn(),
      checkEligibility: (task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">) => {
        if (task.status !== "confirmed") {
          return {
            eligible: false,
            reason: "Chỉ công việc đã được xác nhận (status: confirmed) mới có thể lên lịch.",
          }
        }
        if (task.deadlineType !== "exact") {
          if (task.deadlineType === "relative") {
            return {
              eligible: false,
              reason: "Hạn chót tương đối chưa được quy đổi thành ngày cụ thể.",
            }
          }
          if (task.deadlineType === "ambiguous") {
            return {
              eligible: false,
              reason: "Hạn chót không rõ ràng. Vui lòng xác định ngày cụ thể trước khi lên lịch.",
            }
          }
          return {
            eligible: false,
            reason: "Công việc không có hạn chót.",
          }
        }
        if (!task.deadlineDate) {
          return {
            eligible: false,
            reason: "Thiếu ngày hạn chót hợp lệ.",
          }
        }
        return { eligible: true }
      },
      getEventForTask: vi.fn(),
      reload: vi.fn(),
    }
  }),
}))

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-test-ui",
    documentId: "doc-1",
    title: "Nộp hồ sơ khai thuế",
    status: "confirmed",
    deadlineType: "exact",
    deadlineDate: "2026-10-15",
    semanticStatus: "VERIFIED",
    evidence: null,
    analysisId: null,
    analysisVersion: null,
    confidence: 0.95,
    userEdited: 0,
    rawDeadline: "15/10/2026",
    confirmedAt: new Date().toISOString(),
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("Calendar UI Integration in TaskCard", () => {
  it("renders 'Thêm vào lịch' button and provider options for confirmed task with exact deadline", () => {
    const task = makeTask()
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Thêm vào lịch")
    expect(html).toContain("Lên lịch sự kiện")
    expect(html).toContain("Lịch nội bộ")
    expect(html).toContain("Windows Calendar")
  })

  it("renders scheduled state with 'Đã lên lịch' and cancel button when task is already scheduled", () => {
    const task = makeTask({ id: "task-scheduled" })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Đã lên lịch")
    expect(html).toContain("Hủy khỏi lịch")
    expect(html).not.toContain("Thêm vào lịch")
  })

  it("renders explanation and 'Sửa hạn chót' button for confirmed task with relative deadline", () => {
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

    expect(html).toContain("Chưa thể thêm vào lịch")
    expect(html).toContain("Hạn chót tương đối chưa được quy đổi thành ngày cụ thể")
    expect(html).toContain("Sửa hạn chót")
    expect(html).not.toContain("Thêm vào lịch")
  })

  it("renders explanation for confirmed task with ambiguous deadline", () => {
    const task = makeTask({
      deadlineType: "ambiguous",
      rawDeadline: "trong tháng tới",
      deadlineDate: null,
    })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Chưa thể thêm vào lịch")
    expect(html).toContain("Hạn chót không rõ ràng")
    expect(html).toContain("Sửa hạn chót")
    expect(html).not.toContain("Thêm vào lịch")
  })

  it("does not render calendar actions for pending tasks", () => {
    const task = makeTask({
      status: "pending",
      confirmedAt: null,
    })
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).not.toContain("Thêm vào lịch")
    expect(html).not.toContain("Đã lên lịch")
    expect(html).toContain("Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo")
  })
})
