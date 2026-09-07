import type { TaskRepository } from "@/repositories/taskRepository"
import type { TaskItem } from "@/services/tasks/types"
import type { CalendarProvider } from "./calendarProvider"
import type {
  CalendarEvent,
  CalendarEligibilityResult,
  CalendarProviderAvailability,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
} from "./types"

export class CalendarService {
  private taskRepository: TaskRepository
  private providers: Map<string, CalendarProvider> = new Map()

  constructor(taskRepository: TaskRepository, providers: CalendarProvider[] = []) {
    this.taskRepository = taskRepository
    for (const provider of providers) {
      this.providers.set(provider.id, provider)
    }
  }

  registerProvider(provider: CalendarProvider): void {
    this.providers.set(provider.id, provider)
  }

  getProvider(id: string): CalendarProvider | undefined {
    return this.providers.get(id)
  }

  async listProviders(): Promise<
    Array<{ id: string; name: string; availability: CalendarProviderAvailability }>
  > {
    const list: Array<{ id: string; name: string; availability: CalendarProviderAvailability }> = []
    for (const provider of this.providers.values()) {
      const availability = await provider.checkAvailability()
      list.push({
        id: provider.id,
        name: provider.name,
        availability,
      })
    }
    return list
  }

  validateTaskEligibility(task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">): CalendarEligibilityResult {
    // Rule 1: Only confirmed tasks can be scheduled
    if (task.status !== "confirmed") {
      return {
        eligible: false,
        reason: `Công việc đang ở trạng thái '${task.status}'. Chỉ công việc đã được xác nhận (confirmed) mới có thể tạo lịch.`,
      }
    }

    // Rule 2: Deadline must be exact
    if (task.deadlineType !== "exact") {
      if (task.deadlineType === "relative") {
        return {
          eligible: false,
          reason: "Hạn chót tương đối (relative) chưa được quy đổi thành ngày cụ thể. Hãy chỉnh sửa hạn chót trước khi lên lịch.",
        }
      }
      if (task.deadlineType === "ambiguous") {
        return {
          eligible: false,
          reason: "Hạn chót không rõ ràng (ambiguous). Vui lòng cập nhật ngày cụ thể trước khi lên lịch.",
        }
      }
      return {
        eligible: false,
        reason: "Công việc không có hạn chót (deadlineType: none). Không thể tự ý tạo ngày cho lịch.",
      }
    }

    // Rule 3: Valid date format
    if (!task.deadlineDate || task.deadlineDate.trim() === "") {
      return {
        eligible: false,
        reason: "Thiếu ngày hạn chót hợp lệ.",
      }
    }

    const parsedDate = new Date(task.deadlineDate)
    if (Number.isNaN(parsedDate.getTime())) {
      return {
        eligible: false,
        reason: `Ngày hạn chót '${task.deadlineDate}' không đúng định dạng ngày hợp lệ.`,
      }
    }

    return { eligible: true }
  }

  async scheduleTask(taskId: string, providerId = "internal"): Promise<CalendarEvent> {
    const taskRecord = await this.taskRepository.findById(taskId)
    if (!taskRecord) {
      throw new Error(`Công việc với ID '${taskId}' không tồn tại.`)
    }

    // Map to TaskItem-like object for validation
    const eligibility = this.validateTaskEligibility({
      status: taskRecord.status as TaskItem["status"],
      deadlineType: taskRecord.deadlineType as TaskItem["deadlineType"],
      deadlineDate: taskRecord.deadlineDate,
    })

    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Công việc không đủ điều kiện lên lịch.")
    }

    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`Calendar provider '${providerId}' không được hỗ trợ.`)
    }

    const availability = await provider.checkAvailability()
    if (!availability.available) {
      throw new Error(`Calendar provider '${provider.name}' không khả dụng: ${availability.reason ?? "Không rõ nguyên nhân"}`)
    }

    // Derive stable idempotency key
    const idempotencyKey = `${taskRecord.id}:${provider.id}`

    // Check if event already exists
    const existing = await provider.getEventByIdempotencyKey(idempotencyKey)
    if (existing) {
      // If deadline or title changed on task, update existing event
      const dateChanged = existing.startDate !== taskRecord.deadlineDate
      const titleChanged = existing.title !== taskRecord.title
      const descChanged = existing.description !== taskRecord.description

      if (dateChanged || titleChanged || descChanged || existing.status === "cancelled") {
        const hasTime = taskRecord.deadlineDate!.includes("T")
        const updateReq: UpdateCalendarEventRequest = {
          title: taskRecord.title,
          description: taskRecord.description ?? null,
          startDate: taskRecord.deadlineDate!,
          endDate: taskRecord.deadlineDate!,
          isAllDay: !hasTime,
          status: "scheduled",
        }
        return provider.updateEvent(existing.id, updateReq)
      }
      return existing
    }

    // Determine timezone explicitly
    const userTimezone =
      typeof Intl !== "undefined" && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"
        : "Asia/Ho_Chi_Minh"

    const hasTime = taskRecord.deadlineDate!.includes("T")
    const isAllDay = !hasTime

    const createRequest: CreateCalendarEventRequest = {
      taskId: taskRecord.id,
      documentId: taskRecord.documentId,
      title: taskRecord.title,
      description: taskRecord.description ?? null,
      startDate: taskRecord.deadlineDate!,
      endDate: taskRecord.deadlineDate!,
      isAllDay,
      timezone: userTimezone,
      idempotencyKey,
    }

    return provider.createEvent(createRequest)
  }

  async cancelEventForTask(taskId: string, providerId?: string): Promise<void> {
    const targetProviders = providerId
      ? [this.providers.get(providerId)].filter((p): p is CalendarProvider => Boolean(p))
      : Array.from(this.providers.values())

    for (const provider of targetProviders) {
      const idempotencyKey = `${taskId}:${provider.id}`
      const existing = await provider.getEventByIdempotencyKey(idempotencyKey)
      if (existing && existing.status !== "cancelled") {
        await provider.updateEvent(existing.id, { status: "cancelled" })
      }
    }
  }

  async syncTaskUpdate(task: TaskItem): Promise<void> {
    for (const provider of this.providers.values()) {
      const idempotencyKey = `${task.id}:${provider.id}`
      const existing = await provider.getEventByIdempotencyKey(idempotencyKey)
      if (!existing) continue

      if (task.status === "cancelled" || task.status === "rejected") {
        if (existing.status !== "cancelled") {
          await provider.updateEvent(existing.id, { status: "cancelled" })
        }
      } else if (task.status === "confirmed" && task.deadlineType === "exact" && task.deadlineDate) {
        const hasTime = task.deadlineDate.includes("T")
        await provider.updateEvent(existing.id, {
          title: task.title,
          description: task.description ?? null,
          startDate: task.deadlineDate,
          endDate: task.deadlineDate,
          isAllDay: !hasTime,
          status: "scheduled",
        })
      }
    }
  }

  async getEventsForTask(taskId: string, providerId?: string): Promise<CalendarEvent[]> {
    const results: CalendarEvent[] = []
    const targetProviders = providerId
      ? [this.providers.get(providerId)].filter((p): p is CalendarProvider => Boolean(p))
      : Array.from(this.providers.values())

    for (const provider of targetProviders) {
      const idempotencyKey = `${taskId}:${provider.id}`
      const event = await provider.getEventByIdempotencyKey(idempotencyKey)
      if (event) {
        results.push(event)
      }
    }
    return results
  }
}
