import type { AnalysisResult, ExtractedField, AnalysisEvidence } from "@/services/ai/types"
import type { TaskCandidate, TaskItem, DeadlineType } from "./types"
import { parseDeadline } from "./deadlineParser"
import type { TaskRepository } from "@/repositories/taskRepository"
import type { NewTaskRecord, TaskRecord } from "@/db/schema"

export interface TaskExtractionOptions {
  minConfidence?: number
}

export class TaskExtractionService {
  private taskRepo: TaskRepository

  constructor(taskRepo: TaskRepository) {
    this.taskRepo = taskRepo
  }

  /**
   * Pure deterministic extraction of task candidates from an AnalysisResult.
   */
  extractCandidates(
    documentId: string,
    analysisId: string | null | undefined,
    analysisVersion: number | null | undefined,
    result: AnalysisResult,
    _options?: TaskExtractionOptions
  ): TaskCandidate[] {
    const candidates: TaskCandidate[] = []
    const seenSignatures = new Set<string>()

    const deadlineFieldKeywords = [
      "due_date",
      "deadline",
      "payment_due",
      "payment_date",
      "due",
      "hạn",
      "thời hạn",
      "ngày hết hạn",
      "ngày đến hạn",
      "kỳ hạn",
      "task",
      "nhiệm vụ",
      "công việc",
      "action",
      "hành động",
      "yêu cầu",
      "nghĩa vụ",
      "ngày bàn giao",
      "thời gian thực hiện",
      "ngày nộp",
    ]

    const actionClaimKeywords = [
      "phải",
      "cần",
      "thanh toán",
      "nộp",
      "bàn giao",
      "thực hiện",
      "đặt cọc",
      "gia hạn",
      "thông báo",
      "hoàn thành",
      "trả trước",
      "chuyển khoản",
      "must",
      "shall",
      "due",
      "deadline",
      "require",
      "submit",
      "pay",
    ]

    // 1. Prioritize structured tasks from AI response if available
    if (result.tasks && result.tasks.length > 0) {
      for (const t of result.tasks) {
        if (!t.title || !t.title.trim()) continue
        const title = t.title.trim()

        const rawDeadlineStr = t.deadline ? String(t.deadline).trim() : null
        let chosenDeadline = parseDeadline(rawDeadlineStr)

        if (chosenDeadline.type === "none" && t.deadlineType) {
          const lower = t.deadlineType.toLowerCase() as DeadlineType
          if (["exact", "relative", "ambiguous", "none"].includes(lower)) {
            chosenDeadline = {
              type: lower,
              raw: rawDeadlineStr,
              normalizedDate: null,
            }
          }
        }

        const assignee = t.assignee ? t.assignee.trim() : null
        const description = assignee ? `Người phụ trách: ${assignee}` : null

        let evidence: AnalysisEvidence | null = null
        if (t.evidence && t.evidence.quote) {
          evidence = {
            claim: title,
            status: t.semanticStatus ?? "VERIFIED",
            confidence: t.confidence ?? 0.95,
            citations: [
              {
                pageNumber: t.evidence.pageNumber || 1,
                sourceText: t.evidence.quote,
              },
            ],
            reasoning: assignee ? `Người phụ trách: ${assignee}` : undefined,
          }
        }

        const signature = `${title.toLowerCase()}_${chosenDeadline.raw ?? ""}`
        if (!seenSignatures.has(signature)) {
          seenSignatures.add(signature)
          candidates.push({
            documentId,
            analysisId: analysisId ?? null,
            analysisVersion: analysisVersion ?? null,
            title,
            description,
            status: "pending",
            deadlineType: chosenDeadline.type,
            rawDeadline: chosenDeadline.raw,
            deadlineDate: chosenDeadline.normalizedDate ?? null,
            semanticStatus: t.semanticStatus ?? (evidence?.status ?? "VERIFIED"),
            confidence: t.confidence ?? (evidence?.confidence ?? 0.95),
            evidence,
          })
        }
      }

      if (candidates.length > 0) {
        return candidates
      }
    }

    // 2. Fallback: Extract candidates from structured fields
    if (result.fields && result.fields.length > 0) {
      for (const field of result.fields) {
        if (!field.name || field.value === null || field.value === undefined) continue

        const lowerName = field.name.toLowerCase()
        const strValue = String(field.value)
        const parsedFromValue = parseDeadline(strValue)
        const parsedFromName = parseDeadline(lowerName)
        const parsedFromEvidence = parseDeadline(field.evidence?.claim)

        const isDeadlineField = deadlineFieldKeywords.some((kw) => lowerName.includes(kw))
        const hasTemporalValue =
          parsedFromValue.type !== "none" ||
          parsedFromName.type !== "none" ||
          parsedFromEvidence.type !== "none"

        if (isDeadlineField || hasTemporalValue) {
          const chosenDeadline =
            parsedFromValue.type !== "none"
              ? parsedFromValue
              : parsedFromEvidence.type !== "none"
              ? parsedFromEvidence
              : parsedFromName

          const title = this.formatFieldTaskTitle(field)
          const signature = `${title.toLowerCase()}_${chosenDeadline.raw ?? ""}`

          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature)
            candidates.push({
              documentId,
              analysisId: analysisId ?? null,
              analysisVersion: analysisVersion ?? null,
              title,
              description: field.evidence?.reasoning ?? (strValue !== title ? strValue : null),
              status: "pending",
              deadlineType: chosenDeadline.type,
              rawDeadline: chosenDeadline.raw,
              deadlineDate: chosenDeadline.normalizedDate ?? null,
              semanticStatus: field.semanticStatus,
              confidence: field.confidence,
              evidence: field.evidence ?? null,
            })
          }
        }
      }
    }

    // 2. Extract actionable items from key evidences
    if (result.evidences && result.evidences.length > 0) {
      for (const ev of result.evidences) {
        if (!ev.claim) continue
        const lowerClaim = ev.claim.toLowerCase()
        const isActionable = actionClaimKeywords.some((kw) => lowerClaim.includes(kw))

        if (isActionable) {
          // Parse deadline from claim or citation text
          let deadline = parseDeadline(ev.claim)
          if (deadline.type === "none" && ev.citations?.[0]?.sourceText) {
            deadline = parseDeadline(ev.citations[0].sourceText)
          }

          const signature = `${ev.claim.toLowerCase()}_${deadline.raw ?? ""}`
          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature)
            candidates.push({
              documentId,
              analysisId: analysisId ?? null,
              analysisVersion: analysisVersion ?? null,
              title: ev.claim,
              description: ev.reasoning ?? null,
              status: "pending",
              deadlineType: deadline.type,
              rawDeadline: deadline.raw,
              deadlineDate: deadline.normalizedDate ?? null,
              semanticStatus: ev.status,
              confidence: ev.confidence,
              evidence: ev,
            })
          }
        }
      }
    }

    return candidates
  }

  private formatFieldTaskTitle(field: ExtractedField): string {
    const val = String(field.value ?? "").trim()
    const name = field.name.trim()

    // If field name is already descriptive (e.g. "Hạn thanh toán hóa đơn")
    if (name.length > 15) {
      return name
    }
    return `${name}: ${val}`
  }

  /**
   * Extracts candidates and idempotently saves new ones into TaskRepository.
   * Already confirmed or rejected tasks are strictly preserved.
   */
  async extractAndSaveCandidates(
    documentId: string,
    analysisId: string | null | undefined,
    analysisVersion: number | null | undefined,
    result: AnalysisResult,
    options?: TaskExtractionOptions
  ): Promise<TaskItem[]> {
    const candidates = this.extractCandidates(
      documentId,
      analysisId,
      analysisVersion,
      result,
      options
    )

    const savedTasks: TaskItem[] = []

    for (const candidate of candidates) {
      // Idempotency check: check if task already exists for this document with same title
      const existing = await this.taskRepo.findExistingCandidate(
        documentId,
        candidate.title,
        candidate.rawDeadline
      )

      if (existing) {
        // Critical safety rule: do not overwrite or revert confirmed, rejected, completed, or cancelled tasks
        if (existing.status !== "pending") {
          savedTasks.push(recordToTaskItem(existing))
          continue
        }

        // If existing task is still pending, update analysis link if version bumped
        const updated = await this.taskRepo.update(existing.id, {
          analysisId: analysisId ?? existing.analysisId,
          analysisVersion: analysisVersion ?? existing.analysisVersion,
          evidence: candidate.evidence ? JSON.stringify(candidate.evidence) : existing.evidence,
          semanticStatus: candidate.semanticStatus,
          confidence: candidate.confidence,
        })

        savedTasks.push(recordToTaskItem(updated, candidate.evidence))
        continue
      }

      // Create new pending candidate
      const now = new Date().toISOString()
      const newId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `task-${documentId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

      const newRecord: NewTaskRecord = {
        id: newId,
        documentId,
        analysisId: analysisId ?? null,
        analysisVersion: analysisVersion ?? null,
        title: candidate.title,
        description: candidate.description ?? null,
        status: "pending",
        deadlineType: candidate.deadlineType,
        rawDeadline: candidate.rawDeadline ?? null,
        deadlineDate: candidate.deadlineDate ?? null,
        semanticStatus: candidate.semanticStatus,
        confidence: candidate.confidence ?? null,
        evidence: candidate.evidence ? JSON.stringify(candidate.evidence) : null,
        userEdited: 0,
        createdAt: now,
        updatedAt: now,
      }

      const created = await this.taskRepo.create(newRecord)
      savedTasks.push(recordToTaskItem(created, candidate.evidence))
    }

    return savedTasks
  }
}

function recordToTaskItem(
  record: TaskRecord,
  fallbackEvidence?: AnalysisEvidence | null
): TaskItem {
  let parsedEvidence: AnalysisEvidence | null = fallbackEvidence ?? null
  if (record.evidence) {
    try {
      parsedEvidence = JSON.parse(record.evidence) as AnalysisEvidence
    } catch {
      // ignore
    }
  }

  return {
    ...record,
    evidence: parsedEvidence,
    status: (record.status as TaskItem["status"]) || "pending",
    semanticStatus: (record.semanticStatus as TaskItem["semanticStatus"]) || "UNCERTAIN",
    deadlineType: (record.deadlineType as TaskItem["deadlineType"]) || "none",
  }
}
