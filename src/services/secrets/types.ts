/**
 * SecretsService abstraction according to ADR-012.
 * Protects credentials by isolating them from SQLite, logs, source code, and job payloads.
 */

export interface SecretsService {
  /**
   * Retrieves a secret by key. Returns null if not configured.
   */
  getSecret(key: string): Promise<string | null>;

  /**
   * Stores or updates a secret securely in the underlying credential store.
   */
  setSecret(key: string, value: string): Promise<void>;

  /**
   * Deletes a secret from the underlying credential store. Idempotent.
   */
  deleteSecret(key: string): Promise<void>;

  /**
   * Checks whether a non-empty secret is configured for the given key.
   * Does NOT return or expose the secret value.
   */
  hasSecret(key: string): Promise<boolean>;

  /**
   * Reports whether the underlying secure credential store is available in current runtime.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Standard application-defined secret keys.
 */
export const SECRET_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
} as const;

export type SecretKey = typeof SECRET_KEYS[keyof typeof SECRET_KEYS];
