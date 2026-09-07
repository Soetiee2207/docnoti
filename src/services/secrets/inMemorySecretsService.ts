import type { SecretsService } from './types';

/**
 * Deterministic in-memory test double / fallback implementation of SecretsService.
 * Does NOT persist secrets to disk, database, or Windows Credential Manager.
 */
export class InMemorySecretsService implements SecretsService {
  private secrets: Map<string, string> = new Map();

  constructor(initialSecrets?: Record<string, string>) {
    if (initialSecrets) {
      for (const [key, value] of Object.entries(initialSecrets)) {
        this.secrets.set(key, value);
      }
    }
  }

  async getSecret(key: string): Promise<string | null> {
    return this.secrets.get(key) ?? null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  async hasSecret(key: string): Promise<boolean> {
    const val = this.secrets.get(key);
    return Boolean(val && val.trim().length > 0);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Helper for tests to inspect stored keys without leaking values in tests
   */
  getStoredKeys(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * Clears all secrets in memory
   */
  clear(): void {
    this.secrets.clear();
  }
}
