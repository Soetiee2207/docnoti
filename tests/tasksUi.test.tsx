import React from "react"
import { describe, it, expect } from "vitest"
import { renderToString } from "react-dom/server"
import { TaskCard } from "@/components/tasks/TaskCard"
import type { TaskItem } from "@/services/tasks"

function makeSampleTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-test-1",
    documentId: "doc-123",
    analysisId: "analysis-1",
    analysisVersion: 1,
    title: "Thanh toán tiền thuê nhà tháng 10",
    description: "Chuyển khoản qua ngân hàng Techcombank",
    status: "pending",
    deadlineType: "exact",
    rawDeadline: "30/09/2026",
    deadlineDate: "2026-09-30",
    semanticStatus: "VERIFIED",
    confidence: 0.98,
    evidence: {
      claim: "Tiền thuê phải thanh toán trước ngày 30/09/2026",
      status: "VERIFIED",
      confidence: 0.98,
      citations: [
        {
          pageNumber: 2,
          sourceText: "Tiền thuê nhà thanh toán trước ngày 30/09/2026.",
        },
      ],
      reasoning: "Điều 3 khoản 1",
    },
    userEdited: 0,
    confirmedAt: null,
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("Tasks UI Component Tests", () => {
  it("renders pending TaskCard with title, exact deadline, and VERIFIED badge", () => {
    const task = makeSampleTask()
    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Thanh toán tiền thuê nhà tháng 10")
    expect(html).toContain("Chờ xác nhận")
    expect(html).toContain("Xác thực")
    expect(html).toContain("2026-09-30")
    expect(html).toContain("Trang 2")
    expect(html).toContain("Tiền thuê nhà thanh toán trước ngày 30/09/2026.")
    expect(html).toContain("Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo")
  })

  it("renders relative deadline with distinctive warning style and no fabricated date", () => {
    const task = makeSampleTask({
      title: "Nộp tiền đặt cọc",
      deadlineType: "relative",
      rawDeadline: "trong 7 ngày",
      deadlineDate: null,
      semanticStatus: "INFERRED",
    })

    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Thời hạn tương đối: trong 7 ngày")
    expect(html).toContain("Suy luận")
    expect(html).not.toContain("Hạn chót:")
  })

  it("renders ambiguous deadline with alert style and no fabricated date", () => {
    const task = makeSampleTask({
      title: "Kiểm tra bảo dưỡng định kỳ",
      deadlineType: "ambiguous",
      rawDeadline: "trong tháng này",
      deadlineDate: null,
      semanticStatus: "UNCERTAIN",
    })

    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Thời hạn chưa cụ thể: trong tháng này")
    expect(html).toContain("Chưa chắc chắn")
  })

  it("renders userEdited badge when task was modified by human", () => {
    const task = makeSampleTask({
      userEdited: 1,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
    })

    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Đã sửa bởi người dùng")
    expect(html).toContain("Đã xác nhận")
    expect(html).not.toContain("Cần bạn xác nhận trước khi lưu")
  })

  it("renders rejected state cleanly", () => {
    const task = makeSampleTask({
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    })

    const html = renderToString(
      <TaskCard
        task={task}
        onConfirm={async () => {}}
        onReject={async () => {}}
      />
    )

    expect(html).toContain("Đã từ chối")
  })
})
