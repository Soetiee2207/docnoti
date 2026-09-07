import type { SecretsService } from './types';
import { InMemorySecretsService } from './inMemorySecretsService';
import { WindowsSecretsService } from './windowsSecretsService';

function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Creates the appropriate SecretsService for current environment.
 * On Tauri Windows: returns WindowsSecretsService backed by Windows Credential Manager.
 * In Web fallback / testing: returns InMemorySecretsService.
 */
export function createDefaultSecretsService(): SecretsService {
  if (isTauriEnvironment()) {
    return new WindowsSecretsService();
  }
  return new InMemorySecretsService();
}

export * from './types';
export * from './inMemorySecretsService';
export * from './windowsSecretsService';
