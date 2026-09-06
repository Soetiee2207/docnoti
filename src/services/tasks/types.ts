import type { SemanticStatus, AnalysisEvidence } from '@/services/ai/types';
import type { TaskRecord, NewTaskRecord } from '@/db/schema';

export type TaskStatus = 'pending' | 'confirmed' | 'rejected' | 'completed' | 'cancelled';

export type DeadlineType = 'exact' | 'relative' | 'ambiguous' | 'none';

export interface ParsedDeadline {
  type: DeadlineType;
  raw: string | null;
  normalizedDate?: string | null;
}

export interface TaskCandidate {
  id?: string;
  documentId: string;
  analysisId?: string | null;
  analysisVersion?: number | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  deadlineType: DeadlineType;
  rawDeadline?: string | null;
  deadlineDate?: string | null;
  semanticStatus: SemanticStatus;
  confidence?: number | null;
  evidence?: AnalysisEvidence | null;
}

export interface TaskFilter {
  documentId?: string;
  status?: TaskStatus | TaskStatus[];
  deadlineType?: DeadlineType;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  deadlineDate?: string | null;
  status?: TaskStatus;
}

export interface TaskItem
  extends Omit<TaskRecord, "evidence" | "semanticStatus" | "status" | "deadlineType"> {
  evidence: AnalysisEvidence | null
  semanticStatus: SemanticStatus
  status: TaskStatus
  deadlineType: DeadlineType
}

export { type TaskRecord, type NewTaskRecord };
