import React from "react"
import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { DashboardOverview } from "@/components/dashboard/DashboardOverview"
import type { TaskItem } from "@/services/tasks"
import type { DocumentRecord } from "@/db/schema"

// Mock useDocuments and useTasks
const mockUseDocuments = vi.fn()
const mockUseTasks = vi.fn()

vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: () => mockUseDocuments(),
}))

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => mockUseTasks(),
}))

function createSampleTask(id: string, title: string, status: TaskItem["status"] = "pending"): TaskItem {
  return {
    id,
    documentId: "doc-1",
    analysisId: "analysis-1",
    analysisVersion: 1,
    title,
    description: "Chi tiết nhiệm vụ",
    status,
    deadlineType: "exact",
    rawDeadline: "15/10/2026",
    deadlineDate: "2026-10-15",
    semanticStatus: "VERIFIED",
    confidence: 0.95,
    evidence: null,
    userEdited: 0,
    confirmedAt: null,
    rejectedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe("DashboardOverview Mock Task Regression Tests", () => {
  it("renders empty state and NO mock tasks when database has no tasks", () => {
    mockUseDocuments.mockReturnValue({
      documents: [] as DocumentRecord[],
      loading: false,
    })

    mockUseTasks.mockReturnValue({
      tasks: [] as TaskItem[],
      pendingCount: 0,
      confirmedCount: 0,
      rejectedCount: 0,
      loading: false,
    })

    const html = renderToString(<DashboardOverview />)

    // Must NOT contain old mock tasks
    expect(html).not.toContain("Thanh toán tiền thuê văn phòng")
    expect(html).not.toContain("Gửi biên bản đối soát")
    expect(html).not.toContain("Nộp tờ khai thuế GTGT")
    expect(html).not.toContain("Nhiệm vụ mẫu cho giao diện V1")

    // Must render clean empty state
    expect(html).toContain("Chưa có công việc cần xử lý")
    expect(html).toContain("Các nhiệm vụ và hạn chót sẽ tự động hiển thị tại đây")
  })

  it("renders only real tasks when database has 2 real tasks", () => {
    const realTask1 = createSampleTask("task-real-1", "Nhập điểm và hoàn thiện kết quả học tập", "pending")
    const realTask2 = createSampleTask("task-real-2", "Kiểm tra và xác nhận kết quả từng lớp", "pending")

    mockUseDocuments.mockReturnValue({
      documents: [] as DocumentRecord[],
      loading: false,
    })

    mockUseTasks.mockReturnValue({
      tasks: [realTask1, realTask2],
      pendingCount: 2,
      confirmedCount: 0,
      rejectedCount: 0,
      loading: false,
    })

    const html = renderToString(<DashboardOverview />)

    // Must NOT contain old mock tasks
    expect(html).not.toContain("Thanh toán tiền thuê văn phòng")
    expect(html).not.toContain("Gửi biên bản đối soát")
    expect(html).not.toContain("Nộp tờ khai thuế GTGT")
    expect(html).not.toContain("Nhiệm vụ mẫu cho giao diện V1")

    // Must render exactly the 2 real tasks
    expect(html).toContain("Nhập điểm và hoàn thiện kết quả học tập")
    expect(html).toContain("Kiểm tra và xác nhận kết quả từng lớp")
    expect(html).not.toContain("Chưa có công việc cần xử lý")
  })
})
