/**
 * Token budgeting and conservative token estimation for docnoti.
 *
 * Designed to prevent OpenAI rate limit / TPM violations (e.g. 200,000 TPM limit)
 * and enforce strict context ceilings for both Q&A and Full Document Summary.
 */

/**
 * Conservative character-to-token approximation ratio for multilingual and Vietnamese text.
 * Standard BPE tokenizers (cl100k_base, o200k_base) consume ~2.8 - 3.2 characters per token
 * on Vietnamese UTF-8 accented text.
 * We use 2.8 chars/token conservatively to guarantee we never underestimate token consumption.
 */
export const CONSERVATIVE_CHARS_PER_TOKEN = 2.8;

/**
 * Calculates a conservative estimated token count for a given text.
 */
export function estimateTokenCount(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CONSERVATIVE_CHARS_PER_TOKEN);
}

export interface RequestTokenBudget {
  /** Maximum total tokens across prompt + completion reserve */
  totalLimit: number;
  /** Reserved token ceiling for model generation output */
  outputReserve: number;
  /** Reserved token ceiling for system instructions */
  systemPromptReserve: number;
  /** Reserved token ceiling for user query and prompt formatting metadata */
  queryReserve: number;
  /** Bounded token ceiling available exclusively for document context / pages */
  contextBudget: number;
  /** Bounded character ceiling derived from contextBudget */
  maxContextCharacters: number;
}

/**
 * Standard Token Budget for Document Q&A (Retrieval-Augmented Mode):
 * - Total request budget: 12,000 tokens (safe margin far below 200k TPM)
 * - Output reserve: 2,500 tokens
 * - System prompt reserve: 2,000 tokens
 * - Query reserve: 1,000 tokens
 * - Grounded context budget: 6,500 tokens (~18,200 characters)
 */
export const DEFAULT_QA_TOKEN_BUDGET: RequestTokenBudget = {
  totalLimit: 12000,
  outputReserve: 2500,
  systemPromptReserve: 2000,
  queryReserve: 1000,
  contextBudget: 6500,
  maxContextCharacters: Math.floor(6500 * CONSERVATIVE_CHARS_PER_TOKEN), // ~18,200 chars
};

/**
 * Standard Token Budget for Full Document Summary:
 * - Total request budget: 14,000 tokens
 * - Output reserve: 3,000 tokens
 * - System prompt reserve: 2,000 tokens
 * - Query / metadata reserve: 1,000 tokens
 * - Document content budget: 8,000 tokens (~22,400 characters)
 */
export const DEFAULT_SUMMARY_TOKEN_BUDGET: RequestTokenBudget = {
  totalLimit: 14000,
  outputReserve: 3000,
  systemPromptReserve: 2000,
  queryReserve: 1000,
  contextBudget: 8000,
  maxContextCharacters: Math.floor(8000 * CONSERVATIVE_CHARS_PER_TOKEN), // ~22,400 chars
};

/**
 * Hard pre-flight gate ceiling for any single outbound OpenAI request prompt.
 * If estimated prompt tokens exceed this ceiling, the call is blocked locally
 * before any network request is dispatched.
 */
export const HARD_MAX_REQUEST_PROMPT_TOKENS = 15000;
